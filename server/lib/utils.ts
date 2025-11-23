export const setIntervalNow = async (callback: () => Promise<void> | void, ms: number) => {
  await callback();
  return setTimeout(callback, ms);
};
