'use client';

import { useState } from 'react';
import { Campaign } from '@/lib/types';
import { ChevronDown } from 'lucide-react';

interface CampaignSelectorProps {
  campaigns: Campaign[];
  selected: Campaign | null;
  onSelect: (campaign: Campaign) => void;
}

export default function CampaignSelector({ campaigns, selected, onSelect }: CampaignSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = campaigns.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-full max-w-lg">
      <div
        className="glass-card p-3 cursor-pointer flex items-center gap-2 min-h-[48px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        {!selected && (
          <span className="text-[var(--text-muted)] text-sm">Selecciona una campaña para analizar...</span>
        )}
        {selected && (
          <span className="text-sm font-medium text-[var(--accent-orange)]">
            {selected.nombre.replace('VIRAL_DEAL_', '')}
            <span className="text-[var(--text-muted)] ml-2 font-normal">{selected.fechaInicio}</span>
          </span>
        )}
        <ChevronDown className={`w-4 h-4 ml-auto text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 glass-card p-2 z-50 max-h-[300px] overflow-y-auto">
          <input
            type="text"
            placeholder="Buscar campaña..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-2 mb-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-orange)]/50"
            onClick={(e) => e.stopPropagation()}
          />
          {filtered.map(campaign => {
            const isSelected = selected?.id === campaign.id;
            return (
              <div
                key={campaign.id}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                  isSelected ? 'bg-[var(--accent-orange)]/10' : 'hover:bg-white/5'
                }`}
                onClick={(e) => { e.stopPropagation(); onSelect(campaign); setIsOpen(false); }}
              >
                <div>
                  <p className="text-sm font-medium">{campaign.nombre.replace('VIRAL_DEAL_', '')}</p>
                  <p className="text-xs text-[var(--text-muted)]">{campaign.fechaInicio} | {campaign.syncIds.length} productos</p>
                </div>
                {isSelected && <div className="w-3 h-3 rounded-full gradient-orange" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
