export function determineTimeContext(date: Date) {
  const hour = date.getHours();
  const isWeekend = [0, 6].includes(date.getDay());

  return {
    isBusinessHours: !isWeekend && hour >= 9 && hour < 17,
    dayType: isWeekend ? "weekend" : ("weekday" as const),
    timeOfDay:
      hour < 12 ? "morning" : hour < 17 ? "afternoon" : ("evening" as const),
  };
}

export function isSimilarTimeContext(date1: Date, date2: Date): boolean {
  const context1 = determineTimeContext(date1);
  const context2 = determineTimeContext(date2);
  return context1.isBusinessHours === context2.isBusinessHours;
}
