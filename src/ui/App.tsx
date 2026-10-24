import type { DeckId } from '../engine/model'

const decks: { id: DeckId; role: string }[] = [
  { id: 'A', role: 'Outgoing track' },
  { id: 'B', role: 'Incoming track' },
]

export function App() {
  return (
    <main className="app">
      <header className="app-header">
        <h1>DJ Flow Lab</h1>
        <p>Transition Builder</p>
      </header>
      <section className="decks" aria-label="Decks">
        {decks.map((deck) => (
          <article key={deck.id} className="deck" aria-label={`Deck ${deck.id}`}>
            <h2>Deck {deck.id}</h2>
            <p>{deck.role}</p>
            <p className="deck-empty">No track loaded</p>
          </article>
        ))}
      </section>
    </main>
  )
}
