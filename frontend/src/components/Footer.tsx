import React from 'react';
import { ShieldCheck, Heart, Terminal, FileText, Activity } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-rule bg-paper-2 text-ink-muted py-10 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          
          {/* Col 1: Project Identity */}
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center space-x-2 text-ink font-display font-extrabold text-base">
              <span className="p-1 rounded bg-accent-light text-accent">
                <Activity className="w-4 h-4" />
              </span>
              <span>MedConnect Pulse</span>
            </div>
            <p className="text-xs text-ink-muted max-w-md leading-relaxed">
              An event-driven healthcare automation platform powered by n8n, Sarvam AI, OpenAI, and Supabase.
              Connecting regional hospital silos into an instant emergency safety net during the Golden Hour.
            </p>
            <div className="flex items-center space-x-2 text-[11px] font-mono text-ink-muted">
              <ShieldCheck className="w-3.5 h-3.5 text-operational" />
              <span>Zero Paid Maps API • Zero Diagnostic AI • Tabular Atomic Locking</span>
            </div>
          </div>

          {/* Col 2: Hackathon Team */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono uppercase text-ink font-bold tracking-wider">
              Team: 4 Bit Minds
            </h4>
            <ul className="text-xs space-y-1.5 font-mono text-ink-muted">
              <li><strong className="text-ink">Ayank Kumar</strong> (Lead · Dev 1)</li>
              <li><strong className="text-ink">Ishan Varshney</strong> (Backend · Dev 2)</li>
              <li><strong className="text-ink">Ishaan Sama</strong> (Frontend · Dev 3)</li>
              <li><strong className="text-ink">Bhavya Gupta</strong> (Integration · Dev 4)</li>
            </ul>
            <p className="text-[10px] text-ink-faint pt-1">
              JIMS Engineering Management Technical Campus
            </p>
          </div>

          {/* Col 3: Specifications & References */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono uppercase text-ink font-bold tracking-wider">
              Artifacts & Stack
            </h4>
            <ul className="text-xs space-y-1.5 font-mono">
              <li className="flex items-center space-x-1.5 text-ink-muted hover:text-accent transition-colors">
                <FileText className="w-3.5 h-3.5 text-accent" />
                <span>MedConnect_Pulse_Spec_.md</span>
              </li>
              <li className="flex items-center space-x-1.5 text-ink-muted hover:text-operational transition-colors">
                <Terminal className="w-3.5 h-3.5 text-operational" />
                <span>n8n Workflows (WF1 to WF7)</span>
              </li>
              <li className="flex items-center space-x-1.5 text-ink-muted">
                <span className="pulse-dot pulse-dot-green" />
                <span>Sarvam AI saaras:v1 STT</span>
              </li>
              <li className="flex items-center space-x-1.5 text-ink-muted">
                <span className="pulse-dot pulse-dot-blue" />
                <span>Supabase PostgreSQL + RLS</span>
              </li>
            </ul>
          </div>

        </div>

        <div className="pt-6 border-t border-rule-subtle flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-ink-muted">
          <p>© 2026 4 Bit Minds · Best Use of n8n in Healthcare Automation</p>
          <div className="flex items-center space-x-1 mt-2 sm:mt-0">
            <span>Built for the Golden Hour with</span>
            <Heart className="w-3.5 h-3.5 text-emergency fill-emergency" />
          </div>
        </div>
      </div>
    </footer>
  );
};

