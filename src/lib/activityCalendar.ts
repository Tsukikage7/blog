export interface GithubDay {
  date: string;
  count: number;
  level: number;
}
export interface ActivityDay {
  date: string;
  count: number;
  level: number;
  outside: boolean;
  future: boolean;
}

const DAY_MS = 86400000;
const intensity = (count: number) =>
  count === 0 ? 0 : count < 4 ? 1 : count < 10 ? 2 : count < 30 ? 3 : 4;

export function buildActivityCalendar(
  today: string,
  publicationDates: string[],
  githubDays: GithubDay[],
) {
  const year = Number(today.slice(0, 4));
  const publications = new Map<string, number>();
  for (const date of publicationDates) {
    if (date.startsWith(`${year}-`) && date <= today)
      publications.set(date, (publications.get(date) ?? 0) + 1);
  }
  const github = new Map(
    githubDays
      .filter((day) => day.date.startsWith(`${year}-`) && day.date <= today)
      .map((day) => [day.date, day]),
  );
  const start = new Date(Date.UTC(year, 0, 1));
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  const calendarStart = start.getTime() - mondayOffset * DAY_MS;
  const end = Date.UTC(year + 1, 0, 1);
  const weekCount = Math.ceil((end - calendarStart) / (7 * DAY_MS));
  const weeks: ActivityDay[][] = Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const date = new Date(calendarStart + (week * 7 + weekday) * DAY_MS)
        .toISOString()
        .slice(0, 10);
      const outside = !date.startsWith(`${year}-`);
      const future = date > today;
      const git = outside || future ? 0 : (github.get(date)?.count ?? 0);
      const posts = outside || future ? 0 : (publications.get(date) ?? 0);
      return {
        date,
        count: git + posts,
        level: intensity(git + posts),
        outside,
        future,
      };
    }),
  );
  const days = weeks.flat().filter((day) => !day.outside && !day.future);
  const stats = {
    total: days.reduce((sum, day) => sum + day.count, 0),
    activeDays: days.filter((day) => day.count > 0).length,
  };
  const months = Array.from({ length: 12 }, (_, month) => ({
    name: `${month + 1}月`,
    column:
      Math.floor((Date.UTC(year, month, 1) - calendarStart) / (7 * DAY_MS)) + 1,
  }));
  return { year, weeks, months, stats };
}
