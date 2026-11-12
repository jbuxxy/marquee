// ACTIVITY INSIGHTS — a collapsible strip of stat chips (top movie/show/
// user/platform/library, weekly plays/hours, watch streak, peak concurrent
// streams), sourced from Tautulli (Plex) or Jellystat (Jellyfin) — whichever
// resolveStatsBackend() picks (frontend/js/watch-services.js). Entirely
// absent from the DOM unless one of the two is configured — no "coming
// soon" placeholder.
let statsBackend = 'tautulli';

function chipScroll(html, entryId) {
  const idAttr = entryId ? ` id="${entryId}"` : '';
  return `<span class="chip-scroll"><span class="np-ticker-inner"${idAttr}>${html}</span></span>`;
}

function wireChipScroll() {
  document.querySelectorAll('#stats-chips .chip-scroll').forEach((wrap) => {
    const inner = wrap.querySelector('.np-ticker-inner');
    if (!inner) return;
    inner.classList.remove('np-scroll', 'np-scroll-loop');
    wrap.classList.remove('np-ticker-fade');
    requestAnimationFrame(() => {
      const overflow = inner.scrollWidth - wrap.clientWidth;
      const scrolling = overflow > 4;
      wrap.classList.toggle('np-ticker-fade', scrolling);
      if (scrolling) {
        inner.style.setProperty('--np-scroll-dist', `-${overflow + 6}px`);
        inner.style.setProperty('--np-scroll-duration', npScrollDuration(overflow, true));
        inner.classList.add('np-scroll-loop');
      }
    });
  });
}

function applyAnonToInsights() {
  const nameEl = document.getElementById('chip-top-user-name');
  if (nameEl) nameEl.textContent = maskedUser(nameEl.dataset.real || '—');
  wireChipScroll();
}

function escapeHtmlStats(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function fetchStats() {
  const wrap = document.getElementById('insights-wrap');
  const chips = document.getElementById('stats-chips');
  if (!wrap || !chips) return;

  try {
    const r = await fetchT(`/api/${statsBackend}?cmd=get_home_stats&count=5&time_range=7`, {}, 8000);
    if (!r.ok) return;
    const data = await r.json();
    const stats = data?.response?.data ?? [];

    const rows = [];
    let playsTotal = 0;
    let topTitle = '';

    try {
      const [r2, r3, r4] = await Promise.all([
        fetchT(`/api/${statsBackend}?cmd=get_plays_by_date&time_range=7`, {}, 6000),
        fetchT(`/api/${statsBackend}?cmd=get_plays_by_date&time_range=90`, {}, 6000),
        fetchT(`/api/${statsBackend}?cmd=get_plays_by_date&time_range=7&y_axis=duration`, {}, 6000),
      ]);
      if (r2.ok) {
        const series = (await r2.json())?.response?.data?.series ?? [];
        playsTotal = series.reduce((sum, s) => sum + (s.data?.reduce((a, b) => a + b, 0) ?? 0), 0);
        if (playsTotal > 0) rows.push(`<div class="stat-chip"><i class="ti ti-chart-bar"></i> ${chipScroll(`<strong>${playsTotal}</strong> plays this week`)}</div>`);
      }
      if (r4.ok) {
        const series4 = (await r4.json())?.response?.data?.series ?? [];
        const totalSeconds = series4.reduce((sum, s) => sum + (s.data?.reduce((a, b) => a + b, 0) ?? 0), 0);
        if (totalSeconds > 0) {
          const hrs = totalSeconds / 3600;
          const label = hrs >= 10 ? Math.round(hrs).toString() : hrs.toFixed(1);
          rows.push(`<div class="stat-chip"><i class="ti ti-clock"></i> ${chipScroll(`<strong>${label}</strong> hrs streamed this week`)}</div>`);
        }
      }
      if (r3.ok) {
        const streakData = (await r3.json())?.response?.data ?? {};
        const streakDates = streakData.categories ?? [];
        const streakSeries = streakData.series ?? [];
        const countByDate90 = {};
        for (const s of streakSeries) (s.data ?? []).forEach((v, i) => { if (streakDates[i]) countByDate90[streakDates[i]] = (countByDate90[streakDates[i]] ?? 0) + v; });
        let streak = 0;
        const tod = new Date(); tod.setHours(0, 0, 0, 0);
        for (let i = 0; i <= 90; i++) {
          const d = new Date(tod); d.setDate(d.getDate() - i);
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if ((countByDate90[k] ?? 0) > 0) streak++;
          else if (i > 0) break;
        }
        if (streak >= 2) rows.push(`<div class="stat-chip"><i class="ti ti-flame"></i> ${chipScroll(`<strong>${streak}-day</strong> streak`)}</div>`);
      }
    } catch {}

    for (const s of stats) {
      if (s.stat_id === 'top_movies' && s.rows?.[0]) {
        topTitle = s.rows[0].title || '';
        rows.push(`<div class="stat-chip"><i class="ti ti-movie"></i> ${chipScroll(`<strong>${escapeHtmlStats(topTitle)}</strong> most played`)}</div>`);
      } else if (s.stat_id === 'top_tv' && s.rows?.[0]) {
        if (!topTitle) topTitle = s.rows[0].title || '';
        rows.push(`<div class="stat-chip"><i class="ti ti-device-tv"></i> ${chipScroll(`<strong>${escapeHtmlStats(s.rows[0].title || '—')}</strong> most watched`)}</div>`);
      } else if (s.stat_id === 'top_users' && s.rows?.[0]) {
        const userName = s.rows[0].user || '—';
        const playsLabel = s.rows[0].total_plays ? ` · ${s.rows[0].total_plays} plays` : '';
        rows.push(`<div class="stat-chip"><i class="ti ti-trophy"></i> ${chipScroll(`<strong id="chip-top-user-name" data-real="${escapeHtmlStats(userName)}">${escapeHtmlStats(maskedUser(userName))}</strong><span class="chip-dim">${playsLabel}</span> top streamer`)}</div>`);
      } else if (s.stat_id === 'top_platforms' && s.rows?.[0]) {
        rows.push(`<div class="stat-chip"><i class="ti ti-device-desktop"></i> ${chipScroll(`<strong>${escapeHtmlStats(s.rows[0].platform || '—')}</strong> top client`)}</div>`);
      } else if (s.stat_id === 'top_music' && s.rows?.[0]) {
        rows.push(`<div class="stat-chip"><i class="ti ti-music"></i> ${chipScroll(`<strong>${escapeHtmlStats(s.rows[0].title || '—')}</strong> top artist`)}</div>`);
      } else if (s.stat_id === 'top_libraries' && s.rows?.[0]) {
        rows.push(`<div class="stat-chip"><i class="ti ti-folder"></i> ${chipScroll(`<strong>${escapeHtmlStats(s.rows[0].section_name || '—')}</strong> busiest library`)}</div>`);
      } else if (s.stat_id === 'most_concurrent' && s.rows?.length) {
        const peak = s.rows.find((r) => r.title === 'Concurrent Streams');
        if (peak && peak.count >= 2) rows.push(`<div class="stat-chip"><i class="ti ti-bolt"></i> ${chipScroll(`<strong>${peak.count}</strong> streams at once (peak)`)}</div>`);
      }
    }

    if (!rows.length) return;
    chips.innerHTML = rows.join('');

    const preview = document.getElementById('insights-preview');
    if (preview) preview.textContent = [playsTotal ? `${playsTotal} plays` : null, topTitle].filter(Boolean).join(' · ');

    wrap.hidden = false;

    const hdr = document.getElementById('insights-header');
    if (hdr && !hdr._wired) {
      hdr._wired = true;
      hdr.addEventListener('click', () => {
        const open = wrap.classList.toggle('open');
        hdr.setAttribute('aria-expanded', open);
        applyAnonToInsights();
      });
    }
    applyAnonToInsights();
  } catch {}
}

let statsConfig = {};
// Stats need a signed-in visitor; the fetch happens on the auth event below (which also
// fires once on load), not on config, so guests never request it.
document.addEventListener('marquee:config', (e) => {
  statsConfig = e.detail;
  const backend = resolveStatsBackend(e.detail);
  if (backend) statsBackend = backend;
});
document.addEventListener('marquee:anon-changed', applyAnonToInsights);
// /api/tautulli and /api/jellystat are hard-gated for guests (and,
// per-backend, restricted to a matching-provider session) — fetchStats()
// already degrades gracefully (the strip just stays hidden on a 401), this
// just re-fetches immediately on sign-in instead of waiting for a reload.
document.addEventListener('marquee:auth-changed', (e) => {
  if (e.detail?.authenticated) {
    const backend = resolveStatsBackend(statsConfig);
    if (backend) { statsBackend = backend; fetchStats(); }
  }
});
