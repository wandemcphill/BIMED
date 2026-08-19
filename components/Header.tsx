import Image from 'next/image';

export default function Header() {
  return (
    <header className="top">
      <div className="brand">
        <Image src="/bimed-logo.png" alt="Bimed Healthcare Limited" width={200} height={67} priority />
        <div className="brand-copy">
          <span>Bimed Healthcare Limited</span>
          <small>Private recruitment portal</small>
        </div>
      </div>
      <div className="tag">
        <span>Love. Care. Comfort.</span>
        <small>Invitation only</small>
      </div>
    </header>
  );
}
