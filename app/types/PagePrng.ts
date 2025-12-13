class PagePRNG {
  static seed: number = 0;
  private state: number;

  constructor() {
    if (PagePRNG.seed === 0) {
      PagePRNG.seed = Math.floor(Date.now() * 2147483647);
    }
    this.state = PagePRNG.seed;
  }

  next(): number {
    // Linear congruential generator (LCG) algorithm
    this.state = (this.state * 48271) % 2147483647;
    return this.state;
  }
}

export { PagePRNG };
