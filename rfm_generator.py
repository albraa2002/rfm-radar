"""
rfm_generator.py
================
RFM Profit Radar — Synthetic Data Generator
Generates 100 mock e-commerce customers with RFM scores and segments,
then exports to rfm_data.json for the dashboard to consume.

Usage:
    python rfm_generator.py
    → Produces rfm_data.json in the same directory.
"""

import pandas as pd
import numpy as np
import json
import random

# ─────────────────────────────────────────────────────────────
# 0. REPRODUCIBILITY
# ─────────────────────────────────────────────────────────────
SEED = 42
np.random.seed(SEED)
random.seed(SEED)

# ─────────────────────────────────────────────────────────────
# 1. CUSTOMER NAME POOL
# ─────────────────────────────────────────────────────────────
FIRST_NAMES = [
    "Ahmed", "Sara", "Omar", "Lina", "Karim", "Nour", "Tarek", "Rania",
    "Youssef", "Maya", "Hassan", "Dina", "Mohamed", "Hana", "Alaa",
    "Ines", "Khaled", "Farah", "Sami", "Layla", "James", "Emily",
    "Lucas", "Olivia", "Ethan", "Sophia", "Liam", "Amelia", "Noah",
    "Isabella", "Aiden", "Mia", "Mason", "Charlotte", "Logan", "Harper",
    "Elijah", "Evelyn", "Caden", "Aria", "Jackson", "Scarlett", "Sebastian",
    "Grace", "Mateo", "Chloe", "Henry", "Riley", "Alexander", "Zoe"
]
LAST_NAMES = [
    "Hassan", "Ali", "Ibrahim", "Mostafa", "El-Sayed", "Khalil", "Nasser",
    "Farouk", "Mansour", "Saleh", "Smith", "Johnson", "Williams", "Brown",
    "Jones", "Garcia", "Martinez", "Davis", "Wilson", "Anderson", "Taylor",
    "Thomas", "Moore", "Jackson", "White", "Harris", "Martin", "Thompson",
    "Young", "Lewis", "Lee", "Walker", "Hall", "Allen", "King", "Wright",
    "Scott", "Green", "Adams", "Baker", "Nelson", "Carter", "Mitchell",
    "Perez", "Roberts", "Turner", "Phillips", "Campbell", "Parker", "Evans"
]

def generate_unique_names(n: int) -> list[str]:
    """Generate n unique full names from the name pools."""
    names = set()
    while len(names) < n:
        name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        names.add(name)
    return list(names)

# ─────────────────────────────────────────────────────────────
# 2. RAW DATA GENERATION
#    We bias the distribution to create realistic skew:
#      - Most customers have high Recency (haven't bought recently)
#      - Frequency and Monetary are right-skewed (few VIPs)
# ─────────────────────────────────────────────────────────────
N_CUSTOMERS = 100

# Recency: days since last purchase. Right-skewed → many inactive customers.
recency = np.random.exponential(scale=40, size=N_CUSTOMERS).astype(int)
recency = np.clip(recency, 1, 120)  # bound to [1, 120]

# Frequency: total orders. Heavily right-skewed → few loyal buyers.
frequency = np.random.exponential(scale=8, size=N_CUSTOMERS).astype(int)
frequency = np.clip(frequency, 1, 50)

# Monetary: lifetime spend USD. Power-law skewed → Pareto-like distribution.
monetary = np.random.pareto(a=1.5, size=N_CUSTOMERS) * 500 + 50
monetary = np.clip(monetary, 50, 10000).round(2)

# ─────────────────────────────────────────────────────────────
# 3. BUILD DATAFRAME
# ─────────────────────────────────────────────────────────────
names = generate_unique_names(N_CUSTOMERS)
customer_ids = [f"CUST-{str(i+1).zfill(4)}" for i in range(N_CUSTOMERS)]

df = pd.DataFrame({
    "Customer_ID":   customer_ids,
    "Customer_Name": names,
    "Recency":       recency,
    "Frequency":     frequency,
    "Monetary":      monetary
})

# ─────────────────────────────────────────────────────────────
# 4. RFM SCORING  (1 = worst, 4 = best)
#
#    R Score: INVERTED — lower recency = bought more recently = better score.
#    F Score: Higher frequency = higher score.
#    M Score: Higher monetary = higher score.
#
#    We use pd.qcut with duplicates='drop' to handle ties gracefully.
# ─────────────────────────────────────────────────────────────

def score_column(series: pd.Series, ascending: bool = True, labels=[1,2,3,4]) -> pd.Series:
    """
    Bin a series into quartile-based scores 1-4.
    ascending=True  → higher value = higher score (Frequency, Monetary)
    ascending=False → lower value  = higher score (Recency)
    """
    if ascending:
        return pd.qcut(series, q=4, labels=labels, duplicates='drop').astype(int)
    else:
        # Reverse: rank in reverse so lowest value gets highest score
        return pd.qcut(series.rank(method='first', ascending=True),
                       q=4, labels=labels, duplicates='drop').astype(int)

df['R_Score'] = score_column(df['Recency'],   ascending=False)  # Low recency → high score
df['F_Score'] = score_column(df['Frequency'], ascending=True)
df['M_Score'] = score_column(df['Monetary'],  ascending=True)

# Combined RFM score string for reference (e.g. "432")
df['RFM_Score'] = (
    df['R_Score'].astype(str) +
    df['F_Score'].astype(str) +
    df['M_Score'].astype(str)
)

# ─────────────────────────────────────────────────────────────
# 5. SEGMENTATION LOGIC
#
#    Segment Priority (checked in order):
#    1. At-Risk VIP  → R ≤ 2, F ≥ 3, M ≥ 3  ← THE CORE ALERT
#    2. Champion     → R = 4, F ≥ 3, M ≥ 3
#    3. Loyal        → R ≥ 3, F ≥ 3
#    4. New          → R ≥ 3, F ≤ 2
#    5. Lost         → catch-all for low everything
# ─────────────────────────────────────────────────────────────

def assign_segment(row: pd.Series) -> str:
    r, f, m = row['R_Score'], row['F_Score'], row['M_Score']

    # At-Risk VIP: high historical value, but gone quiet — RED ALERT
    if r <= 2 and f >= 3 and m >= 3:
        return "At-Risk VIP"

    # Champion: recent, frequent, high-spend
    if r == 4 and f >= 3 and m >= 3:
        return "Champion"

    # Loyal: recent and frequent (spend may vary)
    if r >= 3 and f >= 3:
        return "Loyal"

    # New: recently acquired, haven't bought much yet
    if r >= 3 and f <= 2:
        return "New"

    # Lost: haven't bought recently AND low frequency/monetary
    return "Lost"

df['Segment'] = df.apply(assign_segment, axis=1)

# ─────────────────────────────────────────────────────────────
# 6. SEGMENT SUMMARY (console output)
# ─────────────────────────────────────────────────────────────
print("=" * 55)
print("  RFM PROFIT RADAR — Data Generation Complete")
print("=" * 55)
print(f"\n  Total Customers:    {len(df)}")
print(f"\n  Segment Breakdown:")
seg_counts = df['Segment'].value_counts()
for seg, count in seg_counts.items():
    bar = "█" * count
    print(f"    {seg:<18} {count:>3}  {bar}")

at_risk = df[df['Segment'] == 'At-Risk VIP']
revenue_at_risk = at_risk['Monetary'].sum()
print(f"\n  At-Risk VIPs:       {len(at_risk)}")
print(f"  Revenue at Risk:   ${revenue_at_risk:,.2f}")
print("=" * 55)

# ─────────────────────────────────────────────────────────────
# 7. EXPORT TO JSON
#    Convert to list of records, round floats for clean JSON.
# ─────────────────────────────────────────────────────────────
OUTPUT_FILE = "rfm_data.json"

records = df.to_dict(orient='records')

# Ensure all numpy types are native Python types for JSON serialization
def convert(obj):
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return round(float(obj), 2)
    return obj

clean_records = [
    {k: convert(v) for k, v in record.items()}
    for record in records
]

with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(clean_records, f, indent=2, ensure_ascii=False)

print(f"\n  ✓ Data exported to: {OUTPUT_FILE}")
print(f"  ✓ {len(clean_records)} customer records written.\n")
