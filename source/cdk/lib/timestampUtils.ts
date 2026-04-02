const pad = (n: number): string => String(n).padStart(2, "0");

export const formatTimestamp = (date: Date = new Date()): string => {
  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1); // months are 0-indexed
  const yy = pad(date.getFullYear() % 100);
  const HH = pad(date.getHours());
  const ii = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  return `${dd}${mm}${yy}${HH}${ii}${ss}`;
};

/** Appends timestamp with a custom separator (default: "_") */
export const concatTimestamp = (
  value: string,
  separator: string = "_",
  date: Date = new Date()
): string => `${value}${separator}${formatTimestamp(date)}`;