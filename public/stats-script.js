let currentPeriod = 'daily';
let revenueChart = null;
let countChart = null;

const formatKRW = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

async function loadStats() {
    try {
        const data = await apiClient.getSalesStats(currentPeriod);
        renderSummary(data);
        renderCharts(data);
    } catch (err) {
        console.error('Failed to load sales stats:', err);
    }
}

function renderSummary(data) {
    const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
    const totalOrders = data.reduce((s, d) => s + d.count, 0);
    const avg = totalOrders ? totalRevenue / totalOrders : 0;
    const peak = data.reduce((a, b) => (b.revenue > (a?.revenue || 0) ? b : a), null);

    document.getElementById('sumRevenue').textContent = formatKRW(totalRevenue);
    document.getElementById('sumOrders').textContent = totalOrders.toLocaleString('ko-KR');
    document.getElementById('avgOrder').textContent = formatKRW(avg);
    document.getElementById('peakLabel').textContent = peak ? `${peak.label} (${formatKRW(peak.revenue)})` : '-';
}

function renderCharts(data) {
    const labels = data.map(d => d.label);
    const revenues = data.map(d => d.revenue);
    const counts = data.map(d => d.count);

    if (revenueChart) revenueChart.destroy();
    if (countChart) countChart.destroy();

    const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { maxRotation: 45, minRotation: 0 } } }
    };

    revenueChart = new Chart(document.getElementById('revenueChart'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '매출',
                data: revenues,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.15)',
                tension: 0.3,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: '#6366f1'
            }]
        },
        options: {
            ...baseOptions,
            scales: {
                ...baseOptions.scales,
                y: { beginAtZero: true, ticks: { callback: v => `${(v/10000).toFixed(0)}만` } }
            },
            plugins: {
                ...baseOptions.plugins,
                tooltip: { callbacks: { label: ctx => formatKRW(ctx.parsed.y) } }
            }
        }
    });

    countChart = new Chart(document.getElementById('countChart'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '주문 건수',
                data: counts,
                backgroundColor: '#ec4899',
                borderRadius: 6
            }]
        },
        options: {
            ...baseOptions,
            scales: {
                ...baseOptions.scales,
                y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPeriod = btn.dataset.period;
            loadStats();
        });
    });
    loadStats();
});
