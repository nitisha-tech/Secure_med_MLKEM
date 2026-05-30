
"""
SecureMedBlock — Publication-Quality Graph Generator
Generates 3 graphs for performance analysis section.
Run: python3.10 generate_graphs.py
Output: graph1_computation_cost.png, graph2_scalability.png, graph3_security_comparison.png
"""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

# ── Global Style ──────────────────────────────────────────────
plt.rcParams.update({
    'font.family':      'DejaVu Serif',
    'font.size':        11,
    'axes.linewidth':   1.2,
    'axes.edgecolor':   '#333333',
    'xtick.direction':  'out',
    'ytick.direction':  'out',
    'figure.dpi':       300,
    'savefig.dpi':      300,
    'savefig.bbox':     'tight',
    'savefig.pad_inches': 0.15,
})

# ══════════════════════════════════════════════════════════════
# GRAPH 1 — Computation Cost (Horizontal Bar Chart)
# ══════════════════════════════════════════════════════════════

operations = [
    'HMAC-SHA256\nPolicy Key Derivation',
    'Re-encryption\n(Proxy Passthrough)',
    'ML-KEM-768\nKey Generation',
    'AES-256-GCM\nEncryption (1KB)',
    'Decryption\n(Owner)',
    'Hyperledger Fabric\nLogEvent Write',
    'ReKey\nGeneration',
]

avg_times = [0.003, 1.653, 4.952, 6.740, 7.307, 2.740, 10.633]

# Colour by category
colors = [
    '#2ecc71',   # HMAC — green (negligible)
    '#3498db',   # Re-enc — blue
    '#e67e22',   # KeyGen — orange
    '#9b59b6',   # Encrypt — purple
    '#9b59b6',   # Decrypt — purple
    '#e74c3c',   # Fabric — red
    '#e67e22',   # ReKey — orange
]

fig, ax = plt.subplots(figsize=(9, 5.5))
fig.patch.set_facecolor('#FAFAFA')
ax.set_facecolor('#FAFAFA')

bars = ax.barh(operations, avg_times, color=colors,
               edgecolor='white', linewidth=0.8, height=0.6)

# Value labels
for bar, val in zip(bars, avg_times):
    label = f'{val:.3f} ms' if val < 0.01 else f'{val:.2f} ms'
    ax.text(bar.get_width() + 0.15, bar.get_y() + bar.get_height() / 2,
            label, va='center', ha='left', fontsize=9.5, color='#222222')

ax.set_xlabel('Average Execution Time (ms)', fontsize=11, labelpad=8)
ax.set_title('Fig. 1. Computation Cost of Cryptographic Operations\nin the Proposed PQ-PRE Healthcare Scheme',
             fontsize=11.5, fontweight='bold', pad=14)
ax.set_xlim(0, 14.5)
ax.xaxis.grid(True, linestyle='--', alpha=0.5, color='#cccccc')
ax.set_axisbelow(True)
ax.tick_params(axis='y', labelsize=9.5)

# Legend
legend_elements = [
    mpatches.Patch(color='#e67e22', label='KEM Operations'),
    mpatches.Patch(color='#9b59b6', label='AES-GCM Operations'),
    mpatches.Patch(color='#3498db', label='Proxy Operation'),
    mpatches.Patch(color='#e74c3c', label='Blockchain Operation'),
    mpatches.Patch(color='#2ecc71', label='HMAC Derivation'),
]
ax.legend(handles=legend_elements, loc='lower right',
          fontsize=8.5, framealpha=0.85, edgecolor='#cccccc')

plt.tight_layout()
plt.savefig('graph1_computation_cost.png')
plt.close()
print("✅ graph1_computation_cost.png saved")

# ══════════════════════════════════════════════════════════════
# GRAPH 2 — File Size vs Time (Line Chart)
# ══════════════════════════════════════════════════════════════

file_sizes   = ['100 KB', '1 MB', '5 MB', '10 MB']
x            = np.arange(len(file_sizes))

encrypt_times = [8.2,  23.1, 81.4,  202.9]
decrypt_times = [9.1,  22.3, 76.2,  257.2]
rekey_times   = [11.3, 11.3, 11.9,  12.4]

fig, ax = plt.subplots(figsize=(8, 5))
fig.patch.set_facecolor('#FAFAFA')
ax.set_facecolor('#FAFAFA')

ax.plot(x, encrypt_times, 'o-', color='#e74c3c', linewidth=2.2,
        markersize=7, markerfacecolor='white', markeredgewidth=2,
        label='Encryption Time')
ax.plot(x, decrypt_times, 's--', color='#3498db', linewidth=2.2,
        markersize=7, markerfacecolor='white', markeredgewidth=2,
        label='Decryption Time')
ax.plot(x, rekey_times, '^-', color='#2ecc71', linewidth=2.2,
        markersize=7, markerfacecolor='white', markeredgewidth=2,
        label='ReKey Time (O(1) — file-size independent)')

# Annotate ReKey flatness
ax.annotate('ReKey stays ~constant\n(operates on 32-byte secret only)',
            xy=(2, 11.9), xytext=(1.0, 55),
            fontsize=8.5, color='#27ae60',
            arrowprops=dict(arrowstyle='->', color='#27ae60', lw=1.4),
            bbox=dict(boxstyle='round,pad=0.3', fc='#eafaf1', ec='#27ae60', alpha=0.9))

# Value labels on Encrypt line
for xi, val in zip(x, encrypt_times):
    ax.text(xi + 0.04, val + 6, f'{val} ms', fontsize=8, color='#c0392b')

# Value labels on Decrypt line
for xi, val in zip(x, decrypt_times):
    ax.text(xi + 0.04, val - 14, f'{val} ms', fontsize=8, color='#2980b9')

ax.set_xticks(x)
ax.set_xticklabels(file_sizes, fontsize=10.5)
ax.set_xlabel('Medical File Size', fontsize=11, labelpad=8)
ax.set_ylabel('Average Time (ms)', fontsize=11, labelpad=8)
ax.set_title('Fig. 2. Scalability Analysis: Encryption, Decryption, and\nReKey Time vs. Medical File Size',
             fontsize=11.5, fontweight='bold', pad=14)
ax.set_ylim(-10, 290)
ax.yaxis.grid(True, linestyle='--', alpha=0.5, color='#cccccc')
ax.set_axisbelow(True)
ax.legend(fontsize=9.5, loc='upper left', framealpha=0.9, edgecolor='#cccccc')

plt.tight_layout()
plt.savefig('graph2_scalability.png')
plt.close()
print("✅ graph2_scalability.png saved")

# ══════════════════════════════════════════════════════════════
# GRAPH 3 — Security Comparison (Heatmap-style Table)
# ══════════════════════════════════════════════════════════════

schemes = [
    'Proposed\nScheme',
    'Huang et al.\n2024',
    'Industry 5.0\nBase Paper',
    'Lattice CP-ABE\n2025',
    'BC+IPFS+CP-ABE\n2022',
    'CP-ABE+PRE\n2023',
    'PQ Blockchain\n2025',
]

features = [
    'Post-Quantum Security',
    'Proxy Re-Encryption',
    'CP-ABE Access Control',
    'Blockchain Auditability',
    'Immutable Audit Logs',
    'Dept-Aware Access Control',
    'Decentralized Storage (IPFS)',
    'Forward Secrecy',
    'Replay Attack Protection',
    'Key Escrow Resistance',
]

# 1 = full ✓, 0.5 = partial, 0 = ✗
data = np.array([
    # Prop  Huang  Ind50  Latt  BC+IPFS  PRE23  PQ25
    [1,     0,     0,     1,    0,       0,     1   ],  # PQ
    [1,     1,     0,     0,    0,       1,     0   ],  # PRE
    [1,     1,     1,     1,    1,       1,     0   ],  # CP-ABE
    [1,     1,     1,     0,    1,       1,     1   ],  # Blockchain
    [1,     1,     1,     0,    0.5,     0,     1   ],  # Audit Logs
    [1,     0,     0,     0,    0,       0,     0   ],  # Dept-Aware
    [1,     1,     1,     0,    1,       1,     1   ],  # IPFS
    [1,     0,     0,     0,    0,       0,     0   ],  # Forward Secrecy
    [1,     1,     1,     0.5,  1,       1,     1   ],  # Replay
    [1,     1,     0.5,   0,    1,       1,     0.5 ],  # Key Escrow
])

fig, ax = plt.subplots(figsize=(11, 6.5))
fig.patch.set_facecolor('#FAFAFA')

# Custom colormap: white → light green → strong green
from matplotlib.colors import LinearSegmentedColormap
cmap = LinearSegmentedColormap.from_list(
    'security', ['#f5f5f5', '#a8e6b0', '#27ae60'], N=256)

im = ax.imshow(data, cmap=cmap, vmin=0, vmax=1, aspect='auto')

# Cell annotations
symbols = {1: '✓', 0.5: '◑', 0: '✗'}
colors_sym = {1: '#1a5e2a', 0.5: '#7d6608', 0: '#922b21'}

for i in range(len(features)):
    for j in range(len(schemes)):
        val = data[i, j]
        sym = symbols[val]
        col = colors_sym[val]
        weight = 'bold' if val == 1 else 'normal'
        ax.text(j, i, sym, ha='center', va='center',
                fontsize=13, color=col, fontweight=weight)

# Highlight proposed scheme column
for i in range(len(features)):
    ax.add_patch(plt.Rectangle((-0.5 + 0, i - 0.5), 1, 1,
                 fill=False, edgecolor='#e67e22', linewidth=2.5))

ax.set_xticks(range(len(schemes)))
ax.set_xticklabels(schemes, fontsize=9, fontweight='bold')
ax.set_yticks(range(len(features)))
ax.set_yticklabels(features, fontsize=9.5)
ax.xaxis.tick_top()
ax.xaxis.set_label_position('top')

# Bold the proposed scheme header
ax.get_xticklabels()[0].set_color('#c0392b')
ax.get_xticklabels()[0].set_fontweight('extra bold')

ax.set_title('Fig. 3. Security Feature Comparison with Related Schemes\n'
             '(✓ = Supported,  ◑ = Partial,  ✗ = Not Supported)',
             fontsize=11.5, fontweight='bold', pad=28)

# Grid lines
ax.set_xticks(np.arange(-0.5, len(schemes), 1), minor=True)
ax.set_yticks(np.arange(-0.5, len(features), 1), minor=True)
ax.grid(which='minor', color='white', linewidth=1.8)
ax.tick_params(which='minor', bottom=False, left=False, top=False)

# Legend
legend_elements = [
    mpatches.Patch(color='#27ae60', label='✓  Fully Supported'),
    mpatches.Patch(color='#a8e6b0', label='◑  Partially Supported'),
    mpatches.Patch(color='#f5f5f5', label='✗  Not Supported'),
    mpatches.Patch(color='none', edgecolor='#e67e22',
                   linewidth=2, label='Proposed Scheme'),
]
ax.legend(handles=legend_elements, loc='lower right',
          bbox_to_anchor=(1.0, -0.08), ncol=4,
          fontsize=8.5, framealpha=0.9, edgecolor='#cccccc')

plt.tight_layout()
plt.savefig('graph3_security_comparison.png')
plt.close()
print("✅ graph3_security_comparison.png saved")

print("\n🎉 All 3 graphs generated successfully.")
print("   graph1_computation_cost.png")
print("   graph2_scalability.png")
print("   graph3_security_comparison.png")