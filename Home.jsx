export default function Home({ onStart }) {
    return (
        <div className="home">
            <h1>IUT Laval – Exploration Interactive</h1>

            <p>
                Projet expérimental en React Three Fiber.
                Explore librement le campus, découvre les bâtiments
                et expérimente une navigation immersive.
            </p>

            <p>
                Auteur : Steeve Mauprivez - Etudiant MMI<br />
                Année : 2026
            </p>

            <button onClick={onStart}>
                Lancer l’expérience
            </button>
        </div>
    )
}
