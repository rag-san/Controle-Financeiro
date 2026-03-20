"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/src/components/ui/Button";

type FileDropzoneProps = {
  onSelect: (file: File) => void;
  accept?: string;
};

export function FileDropzone({ onSelect, accept = ".csv,.ofx,.pdf" }: FileDropzoneProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = "import-file-input";

  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center" role="group" aria-labelledby="file-dropzone-title">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary">
        <Upload className="h-5 w-5" />
      </div>
      <p id="file-dropzone-title" className="text-sm font-medium text-foreground">
        Selecione o arquivo de extrato do seu banco para importar suas transações.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Formatos aceitos: CSV, OFX e PDF compatível. O arquivo será analisado antes da importação final.
      </p>
      <Button
        className="mt-4 min-w-40"
        variant="secondary"
        onClick={() => inputRef.current?.click()}
        aria-controls={inputId}
      >
        Selecionar arquivo
      </Button>
      <input
        id={inputId}
        ref={inputRef}
        hidden
        type="file"
        accept={accept}
        aria-label="Selecionar arquivo para importacao"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onSelect(file);
        }}
      />
    </div>
  );
}


