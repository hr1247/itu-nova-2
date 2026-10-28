import React, { useEffect, useState } from 'react';
import { X, Bus, Clock, MapPin, DollarSign, Navigation, ArrowRight } from 'lucide-react';
import { fetchKnowledge } from '../services/api';

export default function TransportModal({ isOpen, onClose }) {
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [ituKnowledge, setItuKnowledge] = useState(null);
  const [knowledgeError, setKnowledgeError] = useState('');

  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;
    setKnowledgeError('');
    fetchKnowledge()
      .then(knowledge => {
        if (!cancelled) setItuKnowledge(knowledge);
      })
      .catch(error => {
        if (!cancelled) setKnowledgeError(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  if (!ituKnowledge) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 text-center">
          <p className="text-sm text-slate-200">{knowledgeError || 'Loading ITU transport data...'}</p>
          {knowledgeError && <button onClick={onClose} className="mt-4 text-sm text-blue-300">Close</button>}
        </div>
      </div>
    );
  }

  const routes = ituKnowledge.transportation.routes;
  const currentRoute = routes[selectedRouteIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl glass-panel border border-slate-700/80 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Bus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">ITU Official Transport & Bus Network</h3>
              <p className="text-xs text-slate-400">
                Air-conditioned commuter transit to Arfa Software Technology Park (ASTP)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transport Overview Bar */}
        <div className="px-6 py-3.5 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>Semester Transport Fee: <strong className="text-white">PKR {ituKnowledge.transportation.semesterFee.amountPKR.toLocaleString()}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <Clock className="w-4 h-4 text-itu-400" />
            <span>Campus Arrival: <strong className="text-white">08:15 AM</strong> | Departures: <strong className="text-white">04:30 PM & 06:15 PM</strong></span>
          </div>
        </div>

        {/* Route Selector Pills */}
        <div className="flex px-6 pt-4 gap-2 overflow-x-auto bg-slate-950/40">
          {routes.map((route, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedRouteIdx(idx)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedRouteIdx === idx
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-glow-gold'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Bus className="w-3.5 h-3.5" />
              <span>{route.routeNumber}: {route.name}</span>
            </button>
          ))}
        </div>

        {/* Route Detail & Stop Timeline */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="glass-card p-4 rounded-xl border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-amber-400 font-bold text-xs uppercase tracking-wider">{currentRoute.routeNumber}</span>
              <h4 className="text-base font-bold text-white">{currentRoute.name}</h4>
              <p className="text-xs text-slate-400 mt-0.5">Vehicle Type: {currentRoute.vehicle}</p>
            </div>
            <div className="flex gap-4 text-xs">
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Morning Dep.</span>
                <strong className="text-itu-300">{currentRoute.morningDepartureTime}</strong>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Evening Ret.</span>
                <strong className="text-itu-300">{currentRoute.eveningDepartureTimes.join(' & ')}</strong>
              </div>
            </div>
          </div>

          {/* Timeline of Stops */}
          <div>
            <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-itu-400" />
              <span>Designated Pick-up Points & Schedule</span>
            </h5>

            <div className="relative border-l-2 border-itu-500/40 ml-4 pl-6 space-y-5">
              {currentRoute.stops.map((stop, sIdx) => {
                const isLast = sIdx === currentRoute.stops.length - 1;
                return (
                  <div key={sIdx} className="relative group">
                    {/* Timeline Node Dot */}
                    <div className={`absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full border-2 border-slate-950 ${
                      isLast ? 'bg-emerald-400 ring-4 ring-emerald-500/20' : 'bg-itu-400'
                    }`} />

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 group-hover:border-slate-700 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-itu-400 w-5">
                          #{stop.order}
                        </span>
                        <span className={`text-xs font-medium ${isLast ? 'text-emerald-300 font-bold' : 'text-slate-200'}`}>
                          {stop.stopName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400 pl-7 sm:pl-0">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{stop.time}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Metro Connectivity Callout */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-itu-950 to-slate-900 border border-itu-500/30 text-xs text-slate-300 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-itu-500/20 text-itu-300 mt-0.5">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <strong className="text-white block mb-0.5">Lahore Metro Bus Direct Access:</strong>
              <p className="text-slate-400 leading-relaxed">
                {ituKnowledge.transportation.metroBusConnectivity.details}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
