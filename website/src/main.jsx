import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const REPOSITORY_URL = 'https://github.com/jayb029/Drively';
const DOWNLOAD_URL = `${REPOSITORY_URL}/releases/latest`;

function Header() {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Drively home">
        <img src={`${import.meta.env.BASE_URL}drively-icon.png`} alt="" />
        <span>Drively</span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="#features">Features</a>
        <a href="#privacy">Privacy</a>
        <a href={REPOSITORY_URL}>GitHub</a>
      </nav>
    </header>
  );
}

function LogbookPreview() {
  return (
    <div className="logbook-preview" aria-label="Example Drively progress and recent drives">
      <div className="preview-topline">
        <span>Required hours</span>
        <strong>34h 42m</strong>
      </div>
      <div className="progress-rule" aria-hidden="true"><span /></div>
      <div className="preview-row">
        <div><strong>8h 18m</strong><span>remaining</span></div>
        <div><strong>6h 05m</strong><span>night driving</span></div>
      </div>
      <div className="drive-list">
        <div className="drive-entry">
          <time dateTime="2026-08-03">Aug 3</time>
          <span>Practice route</span>
          <strong>48 min</strong>
        </div>
        <div className="drive-entry">
          <time dateTime="2026-08-01">Aug 1</time>
          <span>Work</span>
          <strong>36 min</strong>
        </div>
        <div className="drive-entry">
          <time dateTime="2026-07-29">Jul 29</time>
          <span>Highway practice</span>
          <strong>1h 12m</strong>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <main id="top">
      <section className="hero">
        <div className="hero-copy">
          <h1>Your driving hours, kept on your phone.</h1>
          <p>Track practice drives, day and night requirements, supervisors, and signed logbook exports without creating an account.</p>
          <div className="hero-actions">
            <a className="button primary" href={DOWNLOAD_URL}>Download for Android</a>
            <a className="button secondary" href={REPOSITORY_URL}>View source</a>
          </div>
          <p className="release-note">Free and open source. Android 7.0 or newer.</p>
        </div>
        <LogbookPreview />
      </section>
    </main>
  );
}

const features = [
  ['Track the drive', 'Time each session with distance, speed, pause support, and Android Picture-in-Picture.'],
  ['Keep a real logbook', 'Record supervisors, conditions, skills, destinations, and day or night time.'],
  ['Take your data with you', 'Export PDF, CSV, or JSON backups and choose what to restore later.'],
];

function Features() {
  return (
    <section className="features" id="features">
      <h2>Everything needed for the practice log</h2>
      <div className="feature-list">
        {features.map(([title, description]) => (
          <article key={title}>
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section className="privacy" id="privacy">
      <div>
        <h2>Private by default</h2>
        <p>Drively has no account, advertising, or analytics. Your logbook stays on your device unless you export it or explicitly enable Android cloud backup.</p>
      </div>
      <ul>
        <li>Weather lookup is optional.</li>
        <li>Background location is used only for enabled drive features.</li>
        <li>Cloud backup is off by default.</li>
      </ul>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <span>Drively is available under the MIT License.</span>
      <div><a href={`${REPOSITORY_URL}/issues/new/choose`}>Report an issue</a><a href={`${REPOSITORY_URL}/blob/main/SECURITY.md`}>Security</a></div>
    </footer>
  );
}

function App() {
  return <><Header /><Hero /><Features /><Privacy /><Footer /></>;
}

createRoot(document.getElementById('root')).render(<App />);
