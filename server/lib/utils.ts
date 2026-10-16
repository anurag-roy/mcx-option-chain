export const setIntervalNow = async (callback: () => Promise<void> | void, ms: number) => {
  await callback();
  return setInterval(callback, ms);
};
