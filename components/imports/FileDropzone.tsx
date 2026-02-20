"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

type FileDropzoneProps = {
  onSelect: (file: File) => void;
  accept?: string;
};

export function FileDropzone({ onSelect, accept = ".csv,.ofx,.pdf" }: FileDropzoneProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary">
        <Upload className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted-foreground">Arraste um arquivo CSV, OFX ou PDF, ou selecione manualmente.</p>
      <Button className="mt-4" variant="secondary" onClick={() => inputRef.current?.click()}>
        Selecionar arquivo
      </Button>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onSelect(file);
        }}
      />
    </div>
  );
}


