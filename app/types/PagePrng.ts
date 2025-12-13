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

  static hash(str: string | null | undefined): number {
    if (str === null || str === undefined) {
      return 0;
    }
    let hash = this.seed;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) % 2147483647;
    }
    return hash;
  }
}

export { PagePRNG };
