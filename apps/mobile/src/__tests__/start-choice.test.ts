import {
  createStartChoiceStore,
  parseStartChoice,
  type ChoiceStorage,
} from '@/features/start/choice-store';

/** In-memory stand-in for the browser's localStorage. */
class FakeChoiceStorage implements ChoiceStorage {
  value: string | null;
  constructor(value: string | null = null) {
    this.value = value;
  }
  read(): string | null {
    return this.value;
  }
  write(value: string): void {
    this.value = value;
  }
}

/** A storage that refuses every access, like a private window. */
class BrokenChoiceStorage implements ChoiceStorage {
  read(): string | null {
    throw new Error('storage blocked');
  }
  write(): void {
    throw new Error('storage blocked');
  }
}

describe('start choice (D-079)', () => {
  test('parseStartChoice keeps only the two known answers', () => {
    expect(parseStartChoice('home')).toBe('home');
    expect(parseStartChoice('world')).toBe('world');
    expect(parseStartChoice('elsewhere')).toBeNull();
    expect(parseStartChoice(null)).toBeNull();
  });

  test('nothing is chosen the first time', () => {
    const store = createStartChoiceStore(new FakeChoiceStorage());
    expect(store.getState().choice).toBeNull();
  });

  test('an answer is remembered for the next visit', () => {
    const storage = new FakeChoiceStorage();
    createStartChoiceStore(storage).getState().choose('home');
    expect(storage.value).toBe('home');
    expect(createStartChoiceStore(storage).getState().choice).toBe('home');
  });

  test('a storage that fails still lets the traveller answer for this visit', () => {
    const store = createStartChoiceStore(new BrokenChoiceStorage());
    expect(store.getState().choice).toBeNull();
    store.getState().choose('world');
    expect(store.getState().choice).toBe('world');
  });
});
