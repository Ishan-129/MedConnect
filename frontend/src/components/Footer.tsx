import React from 'react';
import { ShieldCheck, Activity, Phone, Mail, ExternalLink } from 'lucide-react';

const TelegramIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    className={className} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="12" cy="12" r="12" fill="#229ED9" />
    <path 
      d="M5.4 11.9l11.6-4.6c.5-.2 1 .1.8.8l-2 9.4c-.1.7-.5.8-1.1.5l-3.1-2.3-1.5 1.4c-.2.2-.3.3-.6.3l.2-3.1 5.7-5.2c.2-.2-.1-.3-.4-.1l-7 4.4-3-1c-.7-.2-.7-.7.1-1z" 
      fill="#FFFFFF" 
    />
  </svg>
);

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-rule bg-paper-2 text-ink-muted py-10 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-8">
          
          {/* Col 1: Project Identity */}
          <div className="space-y-3 md:col-span-4">
            <div className="flex items-center space-x-2 text-ink font-display font-extrabold text-base">
              <span className="p-1 rounded bg-accent-light text-accent">
                <Activity className="w-4 h-4" />
              </span>
              <span>MedConnect Pulse</span>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              An event-driven healthcare automation platform connecting regional hospital silos into an instant emergency safety net during the Golden Hour.
            </p>
            <div className="flex items-center space-x-2 text-[11px] font-mono text-ink-muted">
              <ShieldCheck className="w-3.5 h-3.5 text-operational shrink-0" />
              <span>Zero Paid Maps API • Zero Diagnostic AI • Tabular Atomic Locking</span>
            </div>
          </div>

          {/* Col 2: About */}
          <div className="space-y-2 md:col-span-3">
            <h4 className="text-xs font-mono uppercase text-ink font-bold tracking-wider">
              About
            </h4>
            <p className="text-xs text-ink-muted leading-relaxed">
              MedConnect Pulse is a unified emergency safety net and outpatient triage platform. It integrates multilingual AI voice appointments, real-time live queue monitoring, and autonomous 15km Haversine radar dispatch for critical ICU beds and blood transfers.
            </p>
          </div>

          {/* Col 3: Contacts */}
          <div className="space-y-2.5 md:col-span-2">
            <h4 className="text-xs font-mono uppercase text-ink font-bold tracking-wider">
              Contacts
            </h4>
            <ul className="space-y-2 text-xs text-ink-muted">
              <li className="flex items-start gap-2">
                <Phone className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
                <div>
                  <span className="text-ink font-semibold block">24/7 Helpline</span>
                  <a href="tel:108" className="hover:text-accent transition-colors">108 / 112</a>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
                <div>
                  <span className="text-ink font-semibold block">Emergency Desk</span>
                  <a href="mailto:support@medconnectpulse.org" className="hover:text-accent transition-colors break-all">
                    support@medconnectpulse.org
                  </a>
                </div>
              </li>
            </ul>
          </div>

          {/* Col 4: More Info & Telegram */}
          <div className="space-y-2.5 md:col-span-3">
            <h4 className="text-xs font-mono uppercase text-ink font-bold tracking-wider">
              More Info
            </h4>
            <div className="space-y-2.5 text-xs text-ink-muted">
              <div className="p-2.5 rounded-lg bg-paper-subtle border border-rule space-y-1">
                <div className="flex items-center gap-2">
                  <TelegramIcon className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-ink text-xs">Telegram Emergency Bot</span>
                </div>
                <p className="text-[11px] text-ink-muted leading-tight">
                  Instant SOS broadcasts &amp; 1-click dispatch alerts.
                </p>
                <a 
                  href="https://t.me/MedConnecttbot" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-accent font-semibold hover:underline pt-0.5"
                >
                  <span>@MedConnecttbot</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <ul className="space-y-1 text-xs">
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-operational" />
                  <span>System Status: Operational</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span>15km Regional Hospital Grid</span>
                </li>
              </ul>
            </div>
          </div>

        </div>

        <div className="pt-6 border-t border-rule-subtle flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-ink-muted">
          <p>© 2026 4 Bit Minds · Best Use of n8n in Healthcare Automation</p>
        </div>
      </div>
    </footer>
  );
};

