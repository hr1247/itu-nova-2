import React, { useState } from 'react';
import { X, BookOpen, DollarSign, Calculator, Building2, Check, Award, ChevronRight } from 'lucide-react';
import ituKnowledge from '../data/itu_knowledge.json';

export default function KnowledgeExplorerModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('programs');
  const [selectedProgram, setSelectedProgram] = useState('bscs');

  // Interactive Merit Calculator State
  const [matricMarks, setMatricMarks] = useState(950);
  const [matricTotal, setMatricTotal] = useState(1100);
  const [interMarks, setInterMarks] = useState(440);
  const [interTotal, setInterTotal] = useState(520);
  const [testScore, setTestScore] = useState(78);

  if (!isOpen) return null;

  const bscs = ituKnowledge.academicPrograms.undergraduate.find(p => p.id === 'bscs');
  const bsai = ituKnowledge.academicPrograms.undergraduate.find(p => p.id === 'bsai');
  const currentProg = selectedProgram === 'bscs' ? bscs : bsai;

  // Calculate merit aggregate
  const matricPct = (matricMarks / matricTotal) * 100;
  const interPct = (interMarks / interTotal) * 100;
  const aggregate = (matricPct * 0.15) + (interPct * 0.35) + (testScore * 0.50);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl glass-panel border border-slate-700/80 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-itu-500/10 text-itu-400 border border-itu-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">ITU Academic & Knowledge Repository</h3>
              <p className="text-xs text-slate-400">Structured Data from Arfa Software Technology Park (ASTP), Lahore</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 gap-2 overflow-x-auto">
          {[
            { id: 'programs', label: 'Degree Curriculums', icon: BookOpen },
            { id: 'fees', label: 'Credit Hour Fees', icon: DollarSign },
            { id: 'merit', label: 'Merit Calculator & Rules', icon: Calculator },
            { id: 'campus', label: 'ASTP Campus & Labs', icon: Building2 }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
                  isActive
                    ? 'border-itu-400 text-itu-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: PROGRAMS */}
          {activeTab === 'programs' && (
            <div className="space-y-6">
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedProgram('bscs')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    selectedProgram === 'bscs'
                      ? 'bg-itu-600 text-white shadow-glow-itu'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  BS Computer Science (BSCS)
                </button>
                <button
                  onClick={() => setSelectedProgram('bsai')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    selectedProgram === 'bsai'
                      ? 'bg-itu-600 text-white shadow-glow-itu'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  BS Artificial Intelligence (BSAI)
                </button>
              </div>

              {/* Program Meta Card */}
              <div className="glass-card p-4 rounded-xl border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <span className="text-[11px] text-slate-400">Duration</span>
                  <p className="text-sm font-bold text-white">{currentProg.degreeDurationYears} Years (8 Semesters)</p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400">Total Credits</span>
                  <p className="text-sm font-bold text-itu-300">{currentProg.totalCreditHours} Credit Hours</p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400">Fee / Credit</span>
                  <p className="text-sm font-bold text-emerald-400">PKR {currentProg.feeStructure.feePerCreditHour.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400">Accreditation</span>
                  <p className="text-sm font-bold text-amber-400">NCEAC Highest 'W'</p>
                </div>
              </div>

              {/* Semester by semester courses */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Semester-wise Curriculum Breakdown
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {currentProg.curriculumOutline.map((sem) => (
                    <div key={sem.semester} className="glass-card p-3 rounded-xl border-slate-800/80">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                        <span className="text-xs font-bold text-itu-400">Semester {sem.semester}</span>
                        <span className="text-[10px] text-slate-400">
                          {sem.courses.reduce((acc, c) => acc + c.creditHours, 0)} Total Credits
                        </span>
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {sem.courses.map((c, cIdx) => (
                          <li key={cIdx} className="flex justify-between items-center text-[11.5px]">
                            <span className="text-slate-200">{c.code}: {c.title}</span>
                            <span className="text-slate-400 font-mono">{c.creditHours} cr</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FEES */}
          {activeTab === 'fees' && (
            <div className="space-y-6">
              <div className="glass-card p-5 rounded-2xl border-slate-800">
                <h4 className="text-sm font-bold text-white mb-3">Undergraduate Credit Hour Fee Structure</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900 text-itu-300 border-b border-slate-700">
                      <tr>
                        <th className="p-3">Program</th>
                        <th className="p-3">Fee / Credit Hour</th>
                        <th className="p-3">Average Semester (17 Cr)</th>
                        <th className="p-3">Admission Fee (Once)</th>
                        <th className="p-3">Security Deposit (Refundable)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      <tr>
                        <td className="p-3 font-semibold text-white">BS Computer Science (BSCS)</td>
                        <td className="p-3 font-mono text-emerald-400">PKR {bscs.feeStructure.feePerCreditHour.toLocaleString()}</td>
                        <td className="p-3 font-mono">~PKR {bscs.feeStructure.estimatedTuitionPerSemester.toLocaleString()}</td>
                        <td className="p-3 font-mono">PKR {bscs.feeStructure.admissionFeeOneTime.toLocaleString()}</td>
                        <td className="p-3 font-mono">PKR {bscs.feeStructure.securityDepositRefundable.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-white">BS Artificial Intelligence (BSAI)</td>
                        <td className="p-3 font-mono text-emerald-400">PKR {bsai.feeStructure.feePerCreditHour.toLocaleString()}</td>
                        <td className="p-3 font-mono">~PKR {bsai.feeStructure.estimatedTuitionPerSemester.toLocaleString()}</td>
                        <td className="p-3 font-mono">PKR {bsai.feeStructure.admissionFeeOneTime.toLocaleString()}</td>
                        <td className="p-3 font-mono">PKR {bsai.feeStructure.securityDepositRefundable.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Scholarships */}
              <div className="glass-card p-5 rounded-2xl border-slate-800">
                <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-2">
                  <Award className="w-4 h-4" />
                  <span>Scholarships & Financial Assistance</span>
                </h4>
                <p className="text-xs text-slate-300 mb-3">
                  ITU ensures that no deserving candidate is denied quality higher education due to financial constraints.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <strong className="text-white block mb-1">Need-Based Financial Aid</strong>
                    <span className="text-slate-400">Up to 100% tuition waiver based on family income verification.</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <strong className="text-white block mb-1">Dean's Honor Roll</strong>
                    <span className="text-slate-400">Top 3 GPA positions in each cohort receive 50% - 100% tuition concessions.</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <strong className="text-white block mb-1">PEEF & HEC Grants</strong>
                    <span className="text-slate-400">External provincial and national computing scholarship programs.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MERIT CALCULATOR & RULES */}
          {activeTab === 'merit' && (
            <div className="space-y-6">
              {/* Interactive Calculator */}
              <div className="glass-card p-5 rounded-2xl border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-white">Live ITU Aggregate Merit Calculator</h4>
                    <p className="text-xs text-slate-400">Formula: (Matric % × 0.15) + (Inter % × 0.35) + (Test % × 0.50)</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider">Your Aggregate</span>
                    <div className="text-2xl font-black text-itu-400">
                      {aggregate.toFixed(2)}%
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="text-slate-300 font-medium block mb-1">Matric / O-Level Marks</label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        value={matricMarks}
                        onChange={(e) => setMatricMarks(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                        placeholder="Obtained"
                      />
                      <input
                        type="number"
                        value={matricTotal}
                        onChange={(e) => setMatricTotal(Number(e.target.value))}
                        className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                        placeholder="Total"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">Weightage: 15% ({(matricPct * 0.15).toFixed(2)} pts)</span>
                  </div>

                  <div>
                    <label className="text-slate-300 font-medium block mb-1">Inter Part-1 / Total</label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        value={interMarks}
                        onChange={(e) => setInterMarks(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                        placeholder="Obtained"
                      />
                      <input
                        type="number"
                        value={interTotal}
                        onChange={(e) => setInterTotal(Number(e.target.value))}
                        className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                        placeholder="Total"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">Weightage: 35% ({(interPct * 0.35).toFixed(2)} pts)</span>
                  </div>

                  <div>
                    <label className="text-slate-300 font-medium block mb-1">ITU Entry Test / NAT (out of 100)</label>
                    <input
                      type="number"
                      value={testScore}
                      max={100}
                      min={0}
                      onChange={(e) => setTestScore(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                      placeholder="Score"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Weightage: 50% ({(testScore * 0.50).toFixed(2)} pts)</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>Past BSCS Closing Merit: <strong className="text-slate-200">~81.2%</strong></span>
                  <span>Past BSAI Closing Merit: <strong className="text-slate-200">~83.8%</strong></span>
                </div>
              </div>

              {/* Eligibility Guidelines */}
              <div className="glass-card p-5 rounded-2xl border-slate-800 text-xs space-y-2">
                <h4 className="text-sm font-bold text-white mb-2">Eligibility Rules</h4>
                <ul className="space-y-1.5 text-slate-300">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span><strong>Minimum 50% marks</strong> in Intermediate (HSSC) or A-Levels.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span><strong>Pre-Medical with Math bridge:</strong> Eligible per revised HEC policy; deficiency 6-credit math taken in Year 1.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span><strong>Test accepted:</strong> ITU Admission Test (conducted at ASTP) or valid NTS-NAT (NAT-IE / NAT-ICS).</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 4: CAMPUS & LABS */}
          {activeTab === 'campus' && (
            <div className="space-y-4 text-xs">
              <div className="glass-card p-5 rounded-2xl border-slate-800">
                <h4 className="text-sm font-bold text-white mb-2">Arfa Software Technology Park (ASTP) Campus</h4>
                <p className="text-slate-300 leading-relaxed mb-4">
                  Information Technology University is located in Punjab's flagship IT skyscraper on Ferozepur Road, Lahore. 
                  Students study on floors 3, 4, 6, 8, and 9 with direct access to Plan9 IT incubator, high-speed fiber networks, and premier software companies.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ituKnowledge.campusLifeAndFacilities.researchLabs.map((lab, lIdx) => (
                    <div key={lIdx} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                      <strong className="text-itu-300 block mb-1">{lab.name}</strong>
                      <span className="text-slate-400">{lab.focus}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
