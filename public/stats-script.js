let currentPeriod = 'daily';
let revenueChart = null;
let countChart = null;
let hourlyChart = null;

const formatKRW = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const formatHour = (h) => `${String(h).padStart(2, '0')}시`;

async function loadStats() {
    try {
        const [data, hourly] = await Promise.all([
            apiClient.getSalesStats(currentPeriod),
            apiClient.getHourlyStats(currentPeriod)
        ]);
        renderSummary(data);
        renderCharts(data);
        renderHourly(hourly);
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

function renderHourly(hourly) {
    const labels = hourly.map(h => formatHour(h.hour));
    const counts = hourly.map(h => h.count);
    const revenues = hourly.map(h => h.revenue);

    const peak = hourly.reduce((a, b) => (b.count > (a?.count || 0) ? b : a), null);
    const peakLabelEl = document.getElementById('peakHourLabel');
    if (peakLabelEl) {
        peakLabelEl.textContent = peak && peak.count > 0
            ? `· 최다 주문: ${formatHour(peak.hour)} (${peak.count}건)`
            : '';
    }

    const maxCount = Math.max(1, ...counts);
    const colors = counts.map(c => {
        const ratio = c / maxCount;
        if (ratio >= 0.75) return '#ef4444';
        if (ratio >= 0.4) return '#f59e0b';
        if (ratio > 0) return '#6366f1';
        return '#e2e8f0';
    });

    if (hourlyChart) hourlyChart.destroy();
    hourlyChart = new Chart(document.getElementById('hourlyChart'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '주문 건수',
                data: counts,
                backgroundColor: colors,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const idx = ctx.dataIndex;
                            return [
                                `주문: ${counts[idx]}건`,
                                `매출: ${formatKRW(revenues[idx])}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { maxRotation: 0 } },
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
