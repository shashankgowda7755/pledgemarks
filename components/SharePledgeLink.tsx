"use client";
import React, { useState, useEffect } from 'react';
import { Check, Share2 } from 'lucide-react';

export function SharePledgeLink({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    setUrl(window.location.href);
  }, []);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: title,
          text: `Join me and take the pledge: ${title}`,
          url: url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback copy if share fails
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!url) return null;

  return (
    <div className="mt-8 flex flex-col items-center">
      <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">Share This Pledge</p>
      <div className="flex items-center gap-2 bg-white border border-gray-200 p-2 pl-4 rounded-full shadow-sm max-w-sm w-full mx-auto">
        <span className="text-gray-500 text-sm truncate flex-1 font-ibm-mono">{url}</span>
        <button 
          onClick={handleCopy}
          className="bg-indigo-50 hover:bg-indigo-100 text-[#1e1b4b] rounded-full p-2.5 transition-colors flex items-center justify-center shrink-0"
          title="Share or Copy Link"
        >
          {copied ? <Check className="w-5 h-5 text-green-500" /> : <Share2 className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
