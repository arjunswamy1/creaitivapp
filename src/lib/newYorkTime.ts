const NEW_YORK_TIME_ZONE = "America/New_York";

function getNewYorkParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: NEW_YORK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
}

export function getNewYorkDateString(date: Date): string {
  const parts = getNewYorkParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getTodayInNewYork(): string {
  return getNewYorkDateString(new Date());
}

export function isRangeIncludingTodayInNewYork(from: Date, to: Date): boolean {
  const today = getTodayInNewYork();
  const fromLocal = from.toLocaleDateString("en-CA");
  const toLocal = to.toLocaleDateString("en-CA");

  return fromLocal <= today && today <= toLocal;
}