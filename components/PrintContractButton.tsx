'use client';

export default function PrintContractButton() {
  return (
    <button className="secondary" type="button" onClick={() => window.print()}>
      Print / Save PDF
    </button>
  );
}
