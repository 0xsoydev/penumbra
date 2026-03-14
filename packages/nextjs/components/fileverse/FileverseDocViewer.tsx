"use client";

import { useEffect, useState } from "react";
import { fetchAndDecryptDoc } from "~~/services/fileverse";

type Props = {
  cid: string;
  secretKey?: Uint8Array;
};

export function FileverseDocViewer({ cid, secretKey }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    if (secretKey) {
      fetchAndDecryptDoc(cid, secretKey)
        .then(text => {
          setContent(text);
          setLoading(false);
        })
        .catch(() => {
          setError("Failed to decrypt document — check your decryption key.");
          setLoading(false);
        });
    } else {
      setContent(`Encrypted document\nCID: ${cid}\n\nProvide a decryption key to view the full contents.`);
      setLoading(false);
    }
  }, [cid, secretKey]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-base-content/60">
        <span className="loading loading-spinner loading-sm" />
        Loading document...
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-error text-sm">{error}</div>;
  }

  if (!content) return null;

  return (
    <div className="card bg-base-200 p-4">
      <h3 className="font-semibold text-sm mb-2">
        Auction Document{" "}
        <span className="badge badge-outline badge-xs ml-1">via Fileverse</span>
      </h3>
      <pre className="text-xs whitespace-pre-wrap break-all font-mono leading-relaxed">{content}</pre>
      <p className="text-xs text-base-content/40 mt-3">
        Stored encrypted on IPFS · CID:{" "}
        <span className="font-mono">{cid}</span>
      </p>
    </div>
  );
}
