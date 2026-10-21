import { getAllRecords } from '../../data/database.js';

const startOfLocalDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export async function getDashboardStatistics() {
  const [library, events, sessions] = await Promise.all([
    getAllRecords('libraryEntries'),
    getAllRecords('activityEvents'),
    getAllRecords('readingSessions')
  ]);
  const countStatus = status => library.filter(item => item.personalStatus === status).length;
  const favorites = library.filter(item => item.isFavorite).length;
  const today = startOfLocalDay(new Date());
  const daily = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - offset));
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const count = sessions.filter(session => {
      const time = new Date(session.startedAt).getTime();
      return Number.isFinite(time) && time >= day.getTime() && time < next.getTime();
    }).length;
    return { date: day, label: day.toLocaleDateString(undefined, { weekday: 'short' }), sessions: count };
  });
  const completedChapters = (await getAllRecords('chapterProgress')).filter(row => row.readingState === 'completed').length;
  const completedTitles = countStatus('completed');
  const activeSessionSeconds = sessions.reduce((sum, item) => sum + (Number(item.activeDurationSeconds) || 0), 0);
  return {
    totalTitles: library.length,
    reading: countStatus('reading'),
    planned: countStatus('planned'),
    completed: completedTitles,
    paused: countStatus('paused'),
    dropped: countStatus('dropped'),
    favorites,
    completedChapters,
    activeSessionSeconds,
    totalLibraryEvents: events.length,
    daily,
    hasReadingSessions: sessions.length > 0
  };
}
