import { useState, useEffect } from "react";
import { generateMnemonicSuggestions, digitsToConsonants } from "@/lib/mnemonics";

interface MnemonicEditorProps {
  digits: string;
  currentMnemonic?: string;
  onSelect: (mnemonic: string) => void;
  readOnly?: boolean;
}

export default function MnemonicEditor({ digits, currentMnemonic, onSelect, readOnly }: MnemonicEditorProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    if (digits.length > 0) {
      setSuggestions(generateMnemonicSuggestions(digits));
    }
  }, [digits]);

  if (readOnly && currentMnemonic) {
    return (
      <div className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1 text-center">
        💡 {currentMnemonic}
      </div>
    );
  }

  if (readOnly) return null;

  const consonants = digitsToConsonants(digits);

  return (
    <div className="space-y-2 w-full max-w-xs mx-auto">
      <div className="text-[10px] text-muted-foreground text-center uppercase tracking-widest">
        Major System: {consonants}
      </div>

      {currentMnemonic && (
        <div className="text-xs text-primary text-center font-semibold">
          💡 {currentMnemonic}
        </div>
      )}

      <div className="flex flex-wrap gap-1 justify-center">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              currentMnemonic === s
                ? "bg-primary/20 border-primary text-primary"
                : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {showCustom ? (
        <div className="flex gap-1">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Custom mnemonic..."
            className="flex-1 text-xs px-2 py-1 bg-muted/30 border border-border rounded text-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter" && customInput.trim()) {
                onSelect(customInput.trim());
                setShowCustom(false);
                setCustomInput("");
              }
            }}
          />
          <button
            onClick={() => {
              if (customInput.trim()) {
                onSelect(customInput.trim());
                setShowCustom(false);
                setCustomInput("");
              }
            }}
            className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded"
          >
            ✓
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowCustom(true)}
          className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          + custom mnemonic
        </button>
      )}
    </div>
  );
}
