export interface ScrollState {
  canScrollPrev: boolean
  canScrollNext: boolean
}

export function computeScrollState(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): ScrollState {
  const maxScroll = scrollWidth - clientWidth
  if (maxScroll <= 0) {
    return { canScrollPrev: false, canScrollNext: false }
  }
  return {
    canScrollPrev: scrollLeft > 1,
    canScrollNext: Math.ceil(scrollLeft) < maxScroll - 1,
  }
}
