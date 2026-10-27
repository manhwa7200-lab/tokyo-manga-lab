// Pure helpers for the Recent screen: grouping by day and the short labels. No storage or DOM access.
const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

// "Today", "Yesterday", "3 days ago" for the last week, then the date.
export function dayLabel(iso, now = new Date()) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return 'Earlier';
  const days = Math.round((startOfDay(now) - startOfDay(when)) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Rows are already newest first. Returns [{ label, rows }] in that order.
export function groupByDay(rows, now = new Date()) {
  const groups = [];
  for (const row of rows || []) {
    const label = dayLabel(row.openedAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

// "Read to Ch. 190" for a numbered chapter, "Read to Oneshot" otherwise.
export function readToLabel(row) {
  const raw = row?.chapterNumber;
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') return `Read to Ch. ${String(raw).trim().replace(/^0+(?=\d)/, '')}`;
  return row?.chapterLabel ? `Read to ${row.chapterLabel}` : 'Read a chapter';
}

export function pageLabel(row) {
  const total = Number(row?.totalPages) || 0;
  if (!total) return '';
  return `Page ${Math.min(total, (Number(row.page) || 0) + 1)} of ${total}`;
}

export const timeLabel = iso => { const when = new Date(iso); return Number.isNaN(when.getTime()) ? '' : when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
