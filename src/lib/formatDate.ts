import { formatInTimeZone } from "date-fns-tz";

export const formatDate = (
  date: Date | string,
  format: string = "yyyy-MM-dd",
): string => {
  // YAML 日期按 UTC 载入，显示时保持正文日期，不随构建机或读者时区偏移。
  return formatInTimeZone(new Date(date), "UTC", format);
};
