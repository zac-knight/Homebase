# %% [markdown]
# # Homebase usage analysis
#
# A reproducible notebook in "percent" format: open it in VS Code or Jupyter (via jupytext), or
# run it top to bottom with `uv run --extra data python ../analysis/usage_analysis.py ../data`
# from `backend/`. Input is the Parquet export written by `backend/scripts/export_parquet.py`.
#
# Every headline number comes with an interval. Random seeds are fixed, so rerunning on the same
# export gives the same output.

# %%
import sys
from pathlib import Path

import duckdb
import numpy as np
from scipy.stats import chisquare

SEED = 0
DATA = Path(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "../data")
con = duckdb.connect()
for table in ("bookmarks", "events", "features"):
    con.execute(f"CREATE VIEW {table} AS SELECT * FROM read_parquet('{DATA / (table + '.parquet')}')")
rng = np.random.default_rng(SEED)


def bootstrap_ci(values: np.ndarray, n_boot: int = 5000) -> tuple[float, float]:
    idx = rng.integers(0, len(values), size=(n_boot, len(values)))
    lo, hi = np.quantile(values[idx].mean(axis=1), [0.025, 0.975])
    return float(lo), float(hi)


n_bookmarks, n_opens = con.execute("SELECT (SELECT count(*) FROM bookmarks), (SELECT count(*) FROM events WHERE type = 'open')").fetchone()
print(f"{n_bookmarks} bookmarks, {n_opens} recorded opens\n")

# %% [markdown]
# ## 1. What share of bookmarks has never been opened, and does interest decay with age?

# %%
never = con.execute("SELECT (open_count = 0)::INT FROM features").fetchnumpy()["CAST((open_count = 0) AS INTEGER)"].astype(float)
lo, hi = bootstrap_ci(never)
print(f"Never opened: {never.mean():.1%} (95% bootstrap interval {lo:.1%} to {hi:.1%})")
print(
    con.execute("""
    SELECT CASE WHEN age_days < 30 THEN '1. under 30 days' WHEN age_days < 90 THEN '2. 1 to 3 months'
                WHEN age_days < 365 THEN '3. 3 to 12 months' ELSE '4. over a year' END AS age,
           count(*) AS bookmarks, round(avg((open_count > 0)::INT), 3) AS share_opened
    FROM features WHERE age_days IS NOT NULL GROUP BY 1 ORDER BY 1
    """).df().to_string(index=False)
)

# %% [markdown]
# ## 2. Which domains and folders dominate, and how does activity move week to week?

# %%
print(con.execute("SELECT domain, count(*) AS bookmarks, sum(open_count) AS opens FROM features GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT 10").df().to_string(index=False))
print()
print(
    con.execute("""
    SELECT strftime(date_trunc('week', to_timestamp(e.ts / 1000)), '%Y-%m-%d') AS week,
           coalesce(nullif(b.folder, ''), '(unfiled)') AS folder, count(*) AS opens
    FROM events e JOIN bookmarks b USING (canonical_url)
    WHERE e.type = 'open' GROUP BY 1, 2 QUALIFY row_number() OVER (PARTITION BY week ORDER BY opens DESC) <= 3
    ORDER BY 1, 3 DESC
    """).df().to_string(index=False)
)

# %% [markdown]
# ## 3. How common is link rot, and which sites go first?
# Only links the crawler has checked are counted; "unclear" (blocked, rate limited, server error) is
# reported separately rather than guessed either way.

# %%
checked = con.execute("SELECT link_state, count(*) AS n FROM features GROUP BY 1 ORDER BY 2 DESC").df()
print(checked.to_string(index=False))
dead, ok = (int(checked.loc[checked.link_state == s, "n"].sum()) for s in ("dead", "ok"))
if dead + ok:
    flags = np.array([1.0] * dead + [0.0] * ok)
    lo, hi = bootstrap_ci(flags)
    print(f"Link rot among conclusively checked links: {flags.mean():.1%} ({lo:.1%} to {hi:.1%}, n={dead + ok})")
    print(con.execute("SELECT domain, count(*) AS dead FROM features WHERE link_state = 'dead' GROUP BY 1 ORDER BY 2 DESC LIMIT 10").df().to_string(index=False))
else:
    print("No links checked yet: run POST /jobs/check-links first.")

# %% [markdown]
# ## 4. Do I open more links at certain times of day?
# Chi-square test against "every waking hour is equally likely". A small p-value means the hourly
# pattern is unlikely to be chance, which is what makes time of day worth using as a feature.

# %%
by_hour = np.zeros(24)
for hour, n in con.execute("SELECT hour, count(*) FROM events WHERE type = 'open' GROUP BY 1").fetchall():
    by_hour[hour] = n
if by_hour.sum() >= 24:
    waking = by_hour[7:24]
    stat, p = chisquare(waking)
    print("Opens by hour:", {h: int(n) for h, n in enumerate(by_hour) if n})
    print(f"Chi-square vs uniform over 07:00 to 23:59: statistic {stat:.1f}, p = {p:.3g}")
    # How predictable is the next open's hour? Baseline: always guess the most common hour.
    print(f"Always guessing the busiest hour would be right {by_hour.max() / by_hour.sum():.1%} of the time")
else:
    print("Not enough opens yet for an hourly analysis.")

# %% [markdown]
# ## 5. A/B test on myself: does the recommended row beat a plain recent list?

# %%
arms = {}
for variant in ("recommended", "recent"):
    shown, clicks = con.execute(
        "SELECT count(*) FILTER (WHERE type = 'impression'), count(*) FILTER (WHERE type = 'open' AND source = 'rightnow') FROM events WHERE variant = ?",
        [variant],
    ).fetchone()
    arms[variant] = np.array([1.0] * min(clicks, shown) + [0.0] * max(0, shown - clicks))
    print(f"{variant:<12} shown {shown:>4}  clicked {clicks:>4}  rate {arms[variant].mean() if shown else float('nan'):.1%}")
if all(len(a) >= 20 for a in arms.values()):
    diffs = [rng.choice(arms["recommended"], len(arms["recommended"])).mean() - rng.choice(arms["recent"], len(arms["recent"])).mean() for _ in range(5000)]
    lo, hi = np.quantile(diffs, [0.025, 0.975])
    print(f"Difference in click rate (recommended minus recent): 95% interval {lo:+.1%} to {hi:+.1%}")
    print("The interval excludes zero." if lo > 0 or hi < 0 else "The interval includes zero: no clear winner yet.")
else:
    print("Fewer than 20 page views in at least one arm: too early to compare.")
