import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  FileOutput, 
  UploadCloud, 
  Loader2, 
  Columns2, 
  Columns3, 
  LayoutGrid, 
  Square, 
  Copy, 
  Maximize2, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Sparkles, 
  BookOpen, 
  FlaskConical, 
  Check, 
  Edit2, 
  Layers, 
  Eye, 
  EyeOff,
  ChevronRight,
  Undo2,
  RotateCcw,
  Paintbrush,
  CheckSquare,
  GripVertical
} from 'lucide-react';
import { scanImageForSubjects } from '../utils/ocrParser';
import './Calculator.css';

// VIT / Standard University Grading System
const GRADE_POINTS = {
  S: 10,
  A: 9,
  B: 8,
  C: 7,
  D: 6,
  E: 5,
  F: 0,
  N: 0
};

const createDefaultTheory = () => [
  { id: crypto.randomUUID(), name: '', credits: 3, grade: 'S' },
  { id: crypto.randomUUID(), name: '', credits: 3, grade: 'S' },
  { id: crypto.randomUUID(), name: '', credits: 3, grade: 'S' },
  { id: crypto.randomUUID(), name: '', credits: 3, grade: 'S' },
  { id: crypto.randomUUID(), name: '', credits: 3, grade: 'S' }
];

const createDefaultLab = () => [
  { id: crypto.randomUUID(), name: '', credits: 1, grade: 'S' },
  { id: crypto.randomUUID(), name: '', credits: 1, grade: 'S' }
];

const getGpaTier = (gpaVal) => {
  const num = Number(gpaVal);
  if (num >= 9.0) return { label: 'Outstanding', tierClass: 'tier-s', color: 'var(--accent-hover)' };
  if (num >= 8.0) return { label: 'Excellent', tierClass: 'tier-a', color: 'var(--success)' };
  if (num >= 7.0) return { label: 'Very Good', tierClass: 'tier-b', color: '#0ea5e9' };
  if (num >= 6.0) return { label: 'Good', tierClass: 'tier-c', color: '#f59e0b' };
  return { label: 'Needs Focus', tierClass: 'tier-d', color: 'var(--error)' };
};

export default function SemesterCalculator({ initialData, overallData, onChange, onAddToCGPA, onBatchAddToCGPA }) {
  // Initialize multi-semester structure with backward compatibility
  const [semesters, setSemesters] = useState(() => {
    if (initialData?.semesters && Array.isArray(initialData.semesters) && initialData.semesters.length > 0) {
      return initialData.semesters;
    }
    // Backward compatibility with older single-semester schema
    if (initialData?.theory || initialData?.lab) {
      return [
        {
          id: crypto.randomUUID(),
          name: 'Semester 1',
          theory: initialData.theory || createDefaultTheory(),
          lab: initialData.lab || createDefaultLab(),
          isIncluded: true
        }
      ];
    }
    // Default starter with Semester 1 and ready Semester 2 for instant parallel convenience
    return [
      {
        id: crypto.randomUUID(),
        name: 'Semester 1',
        theory: createDefaultTheory(),
        lab: createDefaultLab(),
        isIncluded: true
      },
      {
        id: crypto.randomUUID(),
        name: 'Semester 2',
        theory: [
          { id: crypto.randomUUID(), name: '', credits: 3, grade: 'S' },
          { id: crypto.randomUUID(), name: '', credits: 3, grade: 'S' },
          { id: crypto.randomUUID(), name: '', credits: 3, grade: 'S' },
          { id: crypto.randomUUID(), name: '', credits: 3, grade: 'S' }
        ],
        lab: [
          { id: crypto.randomUUID(), name: '', credits: 1, grade: 'S' }
        ],
        isIncluded: true
      }
    ];
  });

  const [activeSemId, setActiveSemId] = useState(() => {
    return initialData?.activeSemId || (semesters[0]?.id || '');
  });

  // View Mode: 'parallel' for multi-semester deck, 'single' for focused single-semester table
  const [viewMode, setViewMode] = useState(() => {
    return initialData?.viewMode || 'parallel';
  });

  // Layout column density in parallel mode: 'auto' | '2' | '3'
  const [layoutCols, setLayoutCols] = useState(() => {
    return initialData?.layoutCols || 'auto';
  });

  // Inline editing state for semester title
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [editingTitleText, setEditingTitleText] = useState('');

  // Sticky minimal HUD scroll state
  const [isCompact, setIsCompact] = useState(false);

  // OCR Scanning State
  const [isScanning, setIsScanning] = useState(false);
  const [scanningSemId, setScanningSemId] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);

  // Quick feedback toast / message
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // Per-semester Undo History Map: { [semId]: Array<{ theory: [...], lab: [...] }> }
  const [historyMap, setHistoryMap] = useState({});
  const lastEditTimeRef = useRef({});

  // Multi-selection state for batch grade & delete actions: { [`${semId}_${type}`]: [subId1, ...] }
  const [selectedSubsMap, setSelectedSubsMap] = useState({});

  const triggerToast = (msg) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(''), 2500);
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsCompact(prev => {
        if (window.scrollY > 120) return true;
        if (window.scrollY < 40) return false;
        return prev;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Compute stats for an individual semester
  const computeSemStats = (sem) => {
    if (!sem) return { gpa: "0.0000", credits: 0, points: 0, theoryCredits: 0, labCredits: 0, totalSubjects: 0 };
    
    let semCredits = 0;
    let semPoints = 0;
    let theoryCredits = 0;
    let labCredits = 0;

    (sem.theory || []).forEach(sub => {
      if (sub.credits > 0 && Object.keys(GRADE_POINTS).includes(sub.grade)) {
        const c = Number(sub.credits);
        semCredits += c;
        theoryCredits += c;
        semPoints += c * GRADE_POINTS[sub.grade];
      }
    });

    (sem.lab || []).forEach(sub => {
      if (sub.credits > 0 && Object.keys(GRADE_POINTS).includes(sub.grade)) {
        const c = Number(sub.credits);
        semCredits += c;
        labCredits += c;
        semPoints += c * GRADE_POINTS[sub.grade];
      }
    });

    const gpa = semCredits === 0 ? "0.0000" : (semPoints / semCredits).toFixed(4);
    const totalSubjects = (sem.theory?.length || 0) + (sem.lab?.length || 0);

    return { gpa, credits: semCredits, points: semPoints, theoryCredits, labCredits, totalSubjects };
  };

  // Compute all parallel statistics & combined projection
  const computeAllStats = () => {
    const semStatsMap = {};
    let combinedCredits = 0;
    let combinedPoints = 0;
    let activeSemCount = 0;

    semesters.forEach(sem => {
      const stats = computeSemStats(sem);
      semStatsMap[sem.id] = stats;
      if (sem.isIncluded !== false) {
        combinedCredits += stats.credits;
        combinedPoints += stats.points;
        if (stats.credits > 0) activeSemCount++;
      }
    });

    const combinedGpa = combinedCredits === 0 ? "0.0000" : (combinedPoints / combinedCredits).toFixed(4);

    // Live Overall CGPA from past semesters in overallData
    let pastCredits = 0;
    let pastPoints = 0;
    if (overallData && Array.isArray(overallData.semesters)) {
      overallData.semesters.forEach(sem => {
        if (sem.isIncluded !== false && sem.credits > 0 && sem.gpa >= 0) {
          pastCredits += Number(sem.credits);
          pastPoints += Number(sem.credits) * Number(sem.gpa);
        }
      });
    }

    // Single active semester stats
    const activeSem = semesters.find(s => s.id === activeSemId) || semesters[0];
    const activeStats = activeSem ? semStatsMap[activeSem.id] : { gpa: "0.0000", credits: 0, points: 0 };

    let projectedLiveCgpa = null;
    const currentWorkingCredits = viewMode === 'parallel' ? combinedCredits : activeStats.credits;
    const currentWorkingPoints = viewMode === 'parallel' ? combinedPoints : activeStats.points;
    const totalCombinedCredits = currentWorkingCredits + pastCredits;
    const totalCombinedPoints = currentWorkingPoints + pastPoints;

    if (totalCombinedCredits > 0 && pastCredits > 0) {
      projectedLiveCgpa = (totalCombinedPoints / totalCombinedCredits).toFixed(4);
    }

    return {
      semStatsMap,
      combinedGpa,
      combinedCredits,
      activeSemCount,
      projectedLiveCgpa,
      activeStats,
      activeSem
    };
  };

  const {
    semStatsMap,
    combinedGpa,
    combinedCredits,
    activeSemCount,
    projectedLiveCgpa,
    activeStats,
    activeSem
  } = computeAllStats();

  // Notify parent of state changes
  useEffect(() => {
    if (onChange) {
      onChange({
        semesters,
        activeSemId,
        viewMode,
        layoutCols,
        // Legacy backward compatibility fields:
        theory: activeSem?.theory || [],
        lab: activeSem?.lab || [],
        computedSemCgpa: activeStats.gpa,
        computedCombinedCgpa: combinedGpa
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesters, activeSemId, viewMode, layoutCols, activeStats.gpa, combinedGpa]);

  // Semester Management
  const addSemester = (name = null, cloneFromId = null) => {
    const nextNum = semesters.length + 1;
    let newTheory = createDefaultTheory();
    let newLab = createDefaultLab();

    if (cloneFromId) {
      const source = semesters.find(s => s.id === cloneFromId);
      if (source) {
        newTheory = source.theory.map(t => ({ ...t, id: crypto.randomUUID() }));
        newLab = source.lab.map(l => ({ ...l, id: crypto.randomUUID() }));
      }
    }

    const newSem = {
      id: crypto.randomUUID(),
      name: name || `Semester ${nextNum}`,
      theory: newTheory,
      lab: newLab,
      isIncluded: true
    };

    setSemesters([...semesters, newSem]);
    setActiveSemId(newSem.id);
    triggerToast(`Added ${newSem.name}`);
  };

  const removeSemester = (semId) => {
    if (semesters.length <= 1) {
      alert("At least one semester is required.");
      return;
    }
    const filtered = semesters.filter(s => s.id !== semId);
    setSemesters(filtered);
    if (activeSemId === semId) {
      setActiveSemId(filtered[0]?.id || '');
    }
    triggerToast("Semester removed");
  };

  const duplicateSemester = (semId) => {
    const source = semesters.find(s => s.id === semId);
    if (!source) return;
    addSemester(`${source.name} (Copy)`, semId);
  };

  const toggleSemesterInclusion = (semId) => {
    setSemesters(semesters.map(s => {
      if (s.id === semId) {
        return { ...s, isIncluded: s.isIncluded === false ? true : false };
      }
      return s;
    }));
  };

  const startEditingTitle = (sem) => {
    setEditingTitleId(sem.id);
    setEditingTitleText(sem.name);
  };

  const saveEditingTitle = (semId) => {
    const trimmed = editingTitleText.trim();
    if (trimmed) {
      setSemesters(semesters.map(s => s.id === semId ? { ...s, name: trimmed } : s));
    }
    setEditingTitleId(null);
  };

  // Helper to push history snapshot for a semester
  const pushHistory = (semId) => {
    const currentSem = semesters.find(s => s.id === semId);
    if (!currentSem) return;

    const snapshot = {
      theory: JSON.parse(JSON.stringify(currentSem.theory || [])),
      lab: JSON.parse(JSON.stringify(currentSem.lab || []))
    };

    setHistoryMap(prev => {
      const list = prev[semId] || [];
      return {
        ...prev,
        [semId]: [...list.slice(-24), snapshot]
      };
    });
  };

  const pushHistoryDebounced = (semId, fieldKey) => {
    const now = Date.now();
    const key = `${semId}_${fieldKey}`;
    const lastTime = lastEditTimeRef.current[key] || 0;
    if (now - lastTime > 800) {
      pushHistory(semId);
    }
    lastEditTimeRef.current[key] = now;
  };

  const canUndo = (semId) => {
    return Boolean(historyMap[semId] && historyMap[semId].length > 0);
  };

  const getUndoCount = (semId) => {
    return historyMap[semId]?.length || 0;
  };

  const handleUndo = (semId) => {
    const list = historyMap[semId] || [];
    if (list.length === 0) return;

    const previousState = list[list.length - 1];
    const updatedHistory = list.slice(0, -1);

    setHistoryMap(prev => ({
      ...prev,
      [semId]: updatedHistory
    }));

    setSemesters(semesters.map(s => {
      if (s.id === semId) {
        return {
          ...s,
          theory: previousState.theory,
          lab: previousState.lab
        };
      }
      return s;
    }));

    const sem = semesters.find(s => s.id === semId);
    triggerToast(`Undid last edit in ${sem?.name || 'semester'}`);
  };

  const handleResetSemester = (semId) => {
    const targetSem = semesters.find(s => s.id === semId);
    if (!targetSem) return;

    const confirmed = window.confirm(
      `Are you sure you want to reset all courses in "${targetSem.name}"? (You can use Undo to restore them)`
    );
    if (!confirmed) return;

    // Save snapshot so reset is 100% reversible via Undo!
    pushHistory(semId);

    setSemesters(semesters.map(s => {
      if (s.id === semId) {
        return {
          ...s,
          theory: createDefaultTheory(),
          lab: createDefaultLab()
        };
      }
      return s;
    }));

    triggerToast(`Reset ${targetSem.name} to clean defaults (Undo available)`);
  };

  // Universal Clear & Batch Grade Management
  const getSelectedFor = (semId, type) => {
    return selectedSubsMap[`${semId}_${type}`] || [];
  };

  const toggleSelectSubject = (semId, type, subId) => {
    const key = `${semId}_${type}`;
    const current = selectedSubsMap[key] || [];
    const next = current.includes(subId)
      ? current.filter(id => id !== subId)
      : [...current, subId];

    setSelectedSubsMap(prev => ({
      ...prev,
      [key]: next
    }));
  };

  const toggleSelectAll = (semId, type) => {
    const sem = semesters.find(s => s.id === semId);
    if (!sem) return;
    const list = sem[type] || [];
    const key = `${semId}_${type}`;
    const current = selectedSubsMap[key] || [];

    if (current.length === list.length && list.length > 0) {
      setSelectedSubsMap(prev => ({ ...prev, [key]: [] }));
    } else {
      setSelectedSubsMap(prev => ({ ...prev, [key]: list.map(s => s.id) }));
    }
  };

  const clearSelection = (semId, type) => {
    const key = `${semId}_${type}`;
    setSelectedSubsMap(prev => ({ ...prev, [key]: [] }));
  };

  const setBatchGrade = (semId, type, grade, targetIds = null) => {
    const sem = semesters.find(s => s.id === semId);
    if (!sem) return;
    const list = sem[type] || [];
    if (list.length === 0) return;

    pushHistory(semId);

    setSemesters(semesters.map(s => {
      if (s.id === semId) {
        return {
          ...s,
          [type]: (s[type] || []).map(sub => {
            if (!targetIds || targetIds.includes(sub.id)) {
              return { ...sub, grade };
            }
            return sub;
          })
        };
      }
      return s;
    }));

    const count = targetIds ? targetIds.length : list.length;
    triggerToast(`Set ${count} ${type} courses to Grade ${grade}!`);
  };

  const deleteSelectedSubjects = (semId, type) => {
    const key = `${semId}_${type}`;
    const selectedIds = selectedSubsMap[key] || [];
    if (selectedIds.length === 0) return;

    const confirmed = window.confirm(
      `Delete ${selectedIds.length} selected ${type} courses? (You can use Undo to restore them)`
    );
    if (!confirmed) return;

    pushHistory(semId);

    setSemesters(semesters.map(s => {
      if (s.id === semId) {
        return {
          ...s,
          [type]: (s[type] || []).filter(sub => !selectedIds.includes(sub.id))
        };
      }
      return s;
    }));

    clearSelection(semId, type);
    triggerToast(`Deleted ${selectedIds.length} ${type} courses (Undo available)`);
  };

  const clearAllSubjects = (semId, type) => {
    const sem = semesters.find(s => s.id === semId);
    if (!sem) return;
    const count = (sem[type] || []).length;
    if (count === 0) return;

    const confirmed = window.confirm(
      `Delete ALL ${count} ${type} courses in "${sem.name}"? (You can use Undo to restore them)`
    );
    if (!confirmed) return;

    pushHistory(semId);

    setSemesters(semesters.map(s => {
      if (s.id === semId) {
        return {
          ...s,
          [type]: []
        };
      }
      return s;
    }));

    clearSelection(semId, type);
    triggerToast(`Deleted all ${count} ${type} courses in ${sem.name} (Undo available)`);
  };

  // Subject Management within a semester
  const addSubject = (semId, type) => {
    pushHistory(semId);

    const defaultSub = { 
      id: crypto.randomUUID(), 
      name: '', 
      credits: type === 'theory' ? 3 : 1, 
      grade: 'S' 
    };

    setSemesters(semesters.map(sem => {
      if (sem.id === semId) {
        return {
          ...sem,
          [type]: [...(sem[type] || []), defaultSub]
        };
      }
      return sem;
    }));
  };

  const removeSubject = (semId, type, subjectId) => {
    pushHistory(semId);

    setSemesters(semesters.map(sem => {
      if (sem.id === semId) {
        return {
          ...sem,
          [type]: (sem[type] || []).filter(s => s.id !== subjectId)
        };
      }
      return sem;
    }));
  };

  const updateSubject = (semId, type, subjectId, field, value) => {
    if (field === 'grade' || field === 'credits') {
      pushHistory(semId);
    } else if (field === 'name') {
      pushHistoryDebounced(semId, `${subjectId}_name`);
    }

    setSemesters(semesters.map(sem => {
      if (sem.id === semId) {
        const list = sem[type] || [];
        // Auto-learning cache hook for OCR Scanner
        if (field === 'credits') {
          const sub = list.find(s => s.id === subjectId);
          if (sub && sub.name && sub.name.trim().length > 0) {
            try {
              const cached = JSON.parse(localStorage.getItem('userCreditCache') || '{}');
              cached[sub.name.trim().toLowerCase()] = Number(value);
              localStorage.setItem('userCreditCache', JSON.stringify(cached));
            } catch (e) {
              // Ignore cache error
            }
          }
        }

        return {
          ...sem,
          [type]: list.map(sub => sub.id === subjectId ? { ...sub, [field]: value } : sub)
        };
      }
      return sem;
    }));
  };

  // OCR Scanner Handler
  const handleImageUpload = async (e, targetSemId = null) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const destSemId = targetSemId || activeSemId || semesters[0]?.id;
    const destSem = semesters.find(s => s.id === destSemId);

    try {
      setIsScanning(true);
      setScanningSemId(destSemId);
      setScanProgress(0);

      let allExtractedSubjects = [];
      const numFiles = files.length;

      for (let i = 0; i < numFiles; i++) {
        const file = files[i];
        const extracted = await scanImageForSubjects(file, (progress) => {
          setScanProgress(Math.round(((i * 100) + progress) / numFiles));
        });
        allExtractedSubjects.push(...extracted);
      }

      if (allExtractedSubjects.length > 0 && destSem) {
        pushHistory(destSemId);

        let currentTheory = destSem.theory.length === 5 && destSem.theory[0].name === '' ? [] : [...destSem.theory];
        let currentLabs = destSem.lab.length === 3 && destSem.lab[0].name === '' ? [] : [...destSem.lab];

        const existingNames = new Set([...currentTheory, ...currentLabs].map(s => s.name.trim().toLowerCase()));
        const uniqueNewTheory = [];
        const uniqueNewLabs = [];

        allExtractedSubjects.forEach(s => {
          const compName = s.name.trim().toLowerCase();
          if (!existingNames.has(compName)) {
            existingNames.add(compName);
            if (s.type === 'theory') uniqueNewTheory.push(s);
            else uniqueNewLabs.push(s);
          }
        });

        setSemesters(semesters.map(s => {
          if (s.id === destSemId) {
            return {
              ...s,
              theory: [...currentTheory, ...uniqueNewTheory],
              lab: [...currentLabs, ...uniqueNewLabs]
            };
          }
          return s;
        }));

        triggerToast(`Extracted ${uniqueNewTheory.length + uniqueNewLabs.length} courses into ${destSem.name}!`);
      } else {
        alert("Could not detect any clear subjects or credits. Please ensure the screenshot contains course details clearly.");
      }
    } catch (err) {
      alert("Error scanning image: " + err.message);
    } finally {
      setIsScanning(false);
      setScanningSemId(null);
      setScanProgress(0);
      e.target.value = null;
    }
  };

  // Sync Handlers
  const handleSyncSemesterToCGPA = (sem) => {
    const stats = semStatsMap[sem.id];
    if (!stats || stats.credits <= 0) {
      alert("Please add at least one subject with credits before syncing to CGPA.");
      return;
    }
    if (onAddToCGPA) {
      onAddToCGPA(stats.credits, stats.gpa, sem.name);
    }
  };

  const handleSyncAllToCGPA = () => {
    const validSems = semesters
      .filter(s => s.isIncluded !== false)
      .map(s => {
        const stats = semStatsMap[s.id];
        return {
          name: s.name,
          credits: stats?.credits || 0,
          gpa: stats?.gpa || "0.0000"
        };
      })
      .filter(s => s.credits > 0);

    if (validSems.length === 0) {
      alert("No active semesters with valid credits found to sync.");
      return;
    }

    if (onBatchAddToCGPA) {
      onBatchAddToCGPA(validSems);
    } else if (onAddToCGPA) {
      validSems.forEach(s => onAddToCGPA(s.credits, s.gpa, s.name));
    }
  };

  // Calculate semester trend compared to previous semester
  const getSemTrend = (index) => {
    if (index === 0) return null;
    const prevSem = semesters[index - 1];
    const currSem = semesters[index];
    const prevStats = semStatsMap[prevSem?.id];
    const currStats = semStatsMap[currSem?.id];

    if (!prevStats || !currStats || prevStats.credits === 0 || currStats.credits === 0) return null;

    const diff = Number(currStats.gpa) - Number(prevStats.gpa);
    return {
      diff: diff.toFixed(2),
      isPositive: diff > 0,
      isZero: Math.abs(diff) < 0.001
    };
  };

  return (
    <div className="calculator-container animate-fade-in">
      {/* Toast Notification */}
      {feedbackMsg && (
        <div className="toast-notification">
          <Sparkles size={16} /> {feedbackMsg}
        </div>
      )}

      {/* Top Header & View Controls */}
      <div className="workspace-header-bar">
        <div className="header-titles">
          <div className="title-row">
            <h2 className="workspace-title">Semester Control Deck</h2>
            <span className="badge-pill active-count-badge">
              <Layers size={13} /> {semesters.length} {semesters.length === 1 ? 'Semester' : 'Semesters'}
            </span>
          </div>
          <p className="workspace-desc">
            Parallel multi-semester control & live synchronized GPA calculations
          </p>
        </div>

        <div className="header-actions-group">
          {/* Mode Switcher: Parallel Deck vs Single Focused */}
          <div className="mode-segmented-pill">
            <button 
              className={`mode-btn ${viewMode === 'parallel' ? 'active' : ''}`}
              onClick={() => setViewMode('parallel')}
              title="Parallel View: Side-by-side control of multiple semesters"
            >
              <LayoutGrid size={15} />
              <span>Parallel Deck</span>
            </button>
            <button 
              className={`mode-btn ${viewMode === 'single' ? 'active' : ''}`}
              onClick={() => setViewMode('single')}
              title="Single View: Deep focus on one semester"
            >
              <Square size={15} />
              <span>Single Focused</span>
            </button>
          </div>

          {/* Density Switcher (in Parallel Mode) */}
          {viewMode === 'parallel' && (
            <div className="density-toggle-group">
              <button 
                className={`density-btn ${layoutCols === 'auto' ? 'active' : ''}`}
                onClick={() => setLayoutCols('auto')}
                title="Adaptive Fluid Grid"
              >
                Auto
              </button>
              <button 
                className={`density-btn ${layoutCols === '2' ? 'active' : ''}`}
                onClick={() => setLayoutCols('2')}
                title="2 Columns Side-by-Side"
              >
                <Columns2 size={15} />
              </button>
              <button 
                className={`density-btn ${layoutCols === '3' ? 'active' : ''}`}
                onClick={() => setLayoutCols('3')}
                title="3 Columns Triple Deck"
              >
                <Columns3 size={15} />
              </button>
            </div>
          )}

          {/* Add Semester Button */}
          <button 
            className="btn-primary add-sem-btn"
            onClick={() => addSemester()}
            title="Create and manage a new semester"
          >
            <Plus size={16} />
            <span>New Semester</span>
          </button>
        </div>
      </div>

      {/* Master HUD Bar */}
      <div className={`cgpa-display glass-panel ${isCompact ? 'is-compact' : ''}`}>
        <div className="display-content" style={{ flex: 1.2 }}>
          <div className="hud-label-row">
            <h3 style={{ fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {viewMode === 'parallel' ? 'Combined Parallel SGPA' : `${activeSem?.name || 'Semester'} GPA`}
            </h3>
            {viewMode === 'parallel' && (
              <span className="hud-pill-tag">
                {activeSemCount} Active
              </span>
            )}
          </div>
          <div className="cgpa-value smooth-gradient-text" style={{ fontSize: '52px', fontWeight: '800', lineHeight: 1 }}>
            {viewMode === 'parallel' ? combinedGpa : activeStats.gpa}
          </div>
        </div>

        {projectedLiveCgpa !== null && (
          <>
            <div className="divider" style={{ width: '1px', height: '70px', background: 'var(--border-color)', margin: '0 20px' }}></div>
            <div className="display-content" style={{ flex: 1 }}>
              <div className="hud-label-row">
                <h3 style={{ fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Live Overall CGPA
                </h3>
                <span className="hud-pill-tag tag-green">Past + Current</span>
              </div>
              <div className="cgpa-value" style={{ fontSize: '46px', fontWeight: '800', lineHeight: 1, color: 'var(--accent-hover)' }}>
                {projectedLiveCgpa}
              </div>
            </div>
          </>
        )}

        <div className="divider" style={{ width: '1px', height: '70px', background: 'var(--border-color)', margin: '0 20px' }}></div>

        <div className="display-content" style={{ flex: 1 }}>
          <div className="hud-label-row">
            <h3 style={{ fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {viewMode === 'parallel' ? 'Combined Credits' : 'Sem Credits'}
            </h3>
          </div>
          <div className="cgpa-value" style={{ fontSize: '46px', fontWeight: '800', lineHeight: 1, color: 'var(--text-main)' }}>
            {viewMode === 'parallel' ? combinedCredits : activeStats.credits}
          </div>
        </div>

        <div className="hud-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {viewMode === 'parallel' ? (
            <button 
              className="btn-primary cgpa-add-btn" 
              onClick={handleSyncAllToCGPA}
              title="Add all active parallel semesters to the CGPA tracker"
            >
              <FileOutput size={16} />
              {!isCompact && 'Sync All to CGPA'}
            </button>
          ) : (
            <button 
              className="btn-primary cgpa-add-btn" 
              onClick={() => activeSem && handleSyncSemesterToCGPA(activeSem)}
              title="Add this semester to the CGPA tracker"
            >
              <Plus size={16} />
              {!isCompact && 'Add to CGPA'}
            </button>
          )}
        </div>
      </div>

      {/* SINGLE FOCUSED VIEW */}
      {viewMode === 'single' && (
        <div className="single-view-container animate-fade-in">
          {/* Semester Selector Pill Bar */}
          <div className="single-sem-nav-bar glass-panel">
            <div className="single-sem-tabs">
              {semesters.map((sem, idx) => {
                const sStats = semStatsMap[sem.id] || { gpa: "0.0000", credits: 0 };
                const isActive = sem.id === activeSemId;
                const tier = getGpaTier(sStats.gpa);

                return (
                  <button
                    key={sem.id}
                    className={`sem-tab-pill ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveSemId(sem.id)}
                  >
                    <span className="tab-sem-name">{sem.name}</span>
                    <span className={`tab-sem-gpa ${tier.tierClass}`}>
                      {sStats.gpa}
                    </span>
                  </button>
                );
              })}
              <button 
                className="sem-tab-add" 
                onClick={() => addSemester()}
                title="Add new semester"
              >
                <Plus size={16} /> Add Sem
              </button>
            </div>

            {/* Quick Actions for active semester */}
            <div className="single-sem-actions">
              <label 
                htmlFor={`ocr-upload-${activeSemId}`}
                className="btn-secondary ocr-btn"
                title="Auto-fill this semester from screenshot"
              >
                <input 
                  type="file" 
                  id={`ocr-upload-${activeSemId}`}
                  accept="image/*" 
                  multiple
                  style={{ display: 'none' }} 
                  onChange={(e) => handleImageUpload(e, activeSemId)}
                  disabled={isScanning}
                />
                {isScanning && scanningSemId === activeSemId ? (
                  <>
                    <Loader2 size={15} className="animate-spin text-accent" />
                    <span>Scanning ({scanProgress}%)</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={15} className="text-accent" />
                    <span>Scan Screenshot</span>
                  </>
                )}
              </label>

              <button 
                className="btn-secondary icon-btn-round"
                onClick={() => duplicateSemester(activeSemId)}
                title="Duplicate this semester"
              >
                <Copy size={16} />
              </button>

              <button 
                className={`btn-secondary icon-btn-round undo-action-btn ${canUndo(activeSemId) ? '' : 'disabled'}`}
                onClick={() => handleUndo(activeSemId)}
                disabled={!canUndo(activeSemId)}
                title={canUndo(activeSemId) ? `Undo last edit in ${activeSem?.name || 'semester'} (${getUndoCount(activeSemId)} available)` : "No actions to undo"}
              >
                <Undo2 size={16} />
              </button>

              <button 
                className="btn-secondary icon-btn-round reset-sem-btn"
                onClick={() => handleResetSemester(activeSemId)}
                title={`Reset ${activeSem?.name || 'semester'} to clean defaults`}
              >
                <RotateCcw size={16} />
              </button>

              {semesters.length > 1 && (
                <button 
                  className="btn-secondary icon-btn-round delete-sem-btn"
                  onClick={() => removeSemester(activeSemId)}
                  title="Delete this semester"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Single Focused Subject Tables */}
          {activeSem && (
            <>
              {renderFullSubjectTable(activeSem, 'theory')}
              {renderFullSubjectTable(activeSem, 'lab')}
            </>
          )}
        </div>
      )}

      {/* PARALLEL MULTI-SEMESTER DECK VIEW */}
      {viewMode === 'parallel' && (
        <div className={`parallel-deck-grid layout-cols-${layoutCols} animate-fade-in`}>
          {semesters.map((sem, index) => {
            const stats = semStatsMap[sem.id] || { gpa: "0.0000", credits: 0, theoryCredits: 0, labCredits: 0 };
            const tier = getGpaTier(stats.gpa);
            const trend = getSemTrend(index);
            const isExcluded = sem.isIncluded === false;

            return (
              <div 
                key={sem.id} 
                className={`parallel-sem-card glass-panel ${isExcluded ? 'is-excluded' : ''} ${sem.id === activeSemId ? 'is-focused' : ''}`}
              >
                {/* Card Header */}
                <div className="card-top-bar">
                  <div className="sem-identity-group">
                    <span className="sem-number-pill">#{index + 1}</span>
                    
                    {editingTitleId === sem.id ? (
                      <div className="inline-title-editor">
                        <input 
                          type="text" 
                          className="inline-title-input" 
                          value={editingTitleText}
                          onChange={(e) => setEditingTitleText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditingTitle(sem.id);
                            if (e.key === 'Escape') setEditingTitleId(null);
                          }}
                          autoFocus
                        />
                        <button 
                          className="inline-title-save" 
                          onClick={() => saveEditingTitle(sem.id)}
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="sem-title-clickable" onClick={() => startEditingTitle(sem)} title="Click to rename semester">
                        <h3 className="sem-title-text">{sem.name}</h3>
                        <Edit2 size={13} className="title-edit-icon" />
                      </div>
                    )}
                  </div>

                  {/* Card Quick Actions */}
                  <div className="card-toolbar">
                    <button 
                      className={`toolbar-btn ${sem.isIncluded !== false ? 'active-inclusion' : 'inactive-inclusion'}`}
                      onClick={() => toggleSemesterInclusion(sem.id)}
                      title={sem.isIncluded !== false ? "Included in live CGPA (click to exclude)" : "Excluded from live CGPA (click to include)"}
                    >
                      {sem.isIncluded !== false ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>

                    <button 
                      className="toolbar-btn"
                      onClick={() => {
                        setActiveSemId(sem.id);
                        setViewMode('single');
                      }}
                      title="Focus on this semester in deep view"
                    >
                      <Maximize2 size={14} />
                    </button>

                    <button 
                      className="toolbar-btn"
                      onClick={() => duplicateSemester(sem.id)}
                      title="Duplicate this semester"
                    >
                      <Copy size={14} />
                    </button>

                    <button 
                      className={`toolbar-btn undo-card-btn ${canUndo(sem.id) ? '' : 'disabled'}`}
                      onClick={() => handleUndo(sem.id)}
                      disabled={!canUndo(sem.id)}
                      title={canUndo(sem.id) ? `Undo last edit in ${sem.name} (${getUndoCount(sem.id)} available)` : "No actions to undo"}
                    >
                      <Undo2 size={14} />
                    </button>

                    <button 
                      className="toolbar-btn reset-card-btn"
                      onClick={() => handleResetSemester(sem.id)}
                      title={`Reset ${sem.name} to clean defaults`}
                    >
                      <RotateCcw size={14} />
                    </button>

                    {/* Screenshot OCR per semester */}
                    <label 
                      htmlFor={`card-ocr-${sem.id}`}
                      className="toolbar-btn upload-toolbar-btn"
                      title="Auto-Fill this semester from screenshot"
                    >
                      <input 
                        type="file" 
                        id={`card-ocr-${sem.id}`}
                        accept="image/*" 
                        multiple
                        style={{ display: 'none' }} 
                        onChange={(e) => handleImageUpload(e, sem.id)}
                        disabled={isScanning}
                      />
                      {isScanning && scanningSemId === sem.id ? (
                        <Loader2 size={14} className="animate-spin text-accent" />
                      ) : (
                        <UploadCloud size={14} />
                      )}
                    </label>

                    {semesters.length > 1 && (
                      <button 
                        className="toolbar-btn delete-card-btn"
                        onClick={() => removeSemester(sem.id)}
                        title="Delete semester"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Score & Analytics Ribbon */}
                <div className="card-analytics-ribbon">
                  <div className="analytics-score-box">
                    <span className="score-label">Semester GPA</span>
                    <div className="score-val-row">
                      <span className="card-gpa-number smooth-gradient-text">{stats.gpa}</span>
                      <span className={`score-tier-badge ${tier.tierClass}`}>{tier.label}</span>
                    </div>
                  </div>

                  <div className="analytics-meta-box">
                    <div className="meta-item">
                      <span className="meta-label">Credits</span>
                      <span className="meta-val">{stats.credits}</span>
                    </div>
                    {trend && (
                      <div className="meta-item trend-meta">
                        <span className="meta-label">Vs Prior</span>
                        <span className={`trend-badge ${trend.isPositive ? 'trend-up' : trend.isZero ? 'trend-flat' : 'trend-down'}`}>
                          {trend.isPositive ? <TrendingUp size={12} /> : trend.isZero ? <Minus size={12} /> : <TrendingDown size={12} />}
                          {trend.isPositive ? `+${trend.diff}` : trend.diff}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Compact Subjects Manager */}
                <div className="card-subjects-body">
                  {/* Theory Section */}
                  {/* Theory Section */}
                  {(() => {
                    const selTheory = getSelectedFor(sem.id, 'theory');
                    const theoryCount = sem.theory?.length || 0;

                    return (
                      <div className="compact-sub-group">
                        <div className="compact-sub-header">
                          <div className="sub-header-left">
                            <BookOpen size={14} className="text-accent" />
                            <h4>Theory ({theoryCount})</h4>
                            <span className="credits-sub-badge">{stats.theoryCredits} Cr</span>
                          </div>

                          <div className="sub-header-right">
                            {/* Draggable & Clickable Quick Grade Stamper */}
                            {theoryCount > 0 && (
                              <div className="quick-grade-stamp-bar" title="Click to set all to this grade, or drag chip onto any course">
                                <span className="stamp-label">Set All:</span>
                                {['S', 'A', 'B', 'C'].map(g => (
                                  <span 
                                    key={g}
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData('text/plain', g);
                                      e.dataTransfer.effectAllowed = 'copy';
                                    }}
                                    className={`stamp-chip chip-${g.toLowerCase()}`}
                                    onClick={() => setBatchGrade(sem.id, 'theory', g)}
                                    title={`Set all theory to ${g} (or drag to a course)`}
                                  >
                                    {g}
                                  </span>
                                ))}
                              </div>
                            )}

                            <button 
                              className="compact-add-btn"
                              onClick={() => addSubject(sem.id, 'theory')}
                              title="Add theory course"
                            >
                              <Plus size={13} /> Add
                            </button>

                            {theoryCount > 0 && (
                              <button 
                                className="compact-clear-btn"
                                onClick={() => clearAllSubjects(sem.id, 'theory')}
                                title="Universal delete: Delete all theory courses"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Floating / Inline Batch Bar if rows selected */}
                        {selTheory.length > 0 && (
                          <div className="compact-batch-bar animate-fade-in">
                            <span className="batch-count-tag">{selTheory.length} Selected</span>
                            <div className="batch-grade-chips">
                              {['S', 'A', 'B', 'C', 'D'].map(g => (
                                <button 
                                  key={g}
                                  className={`batch-chip chip-${g.toLowerCase()}`}
                                  onClick={() => setBatchGrade(sem.id, 'theory', g, selTheory)}
                                  title={`Set selected to ${g}`}
                                >
                                  {g}
                                </button>
                              ))}
                            </div>
                            <button 
                              className="batch-del-btn"
                              onClick={() => deleteSelectedSubjects(sem.id, 'theory')}
                              title="Delete selected courses"
                            >
                              <Trash2 size={12} />
                            </button>
                            <button 
                              className="batch-clear-btn"
                              onClick={() => clearSelection(sem.id, 'theory')}
                              title="Deselect all"
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        <div className="compact-table-wrap">
                          <table className="compact-sub-table">
                            <thead>
                              <tr>
                                <th style={{ width: '28px', textAlign: 'center' }}>
                                  <input 
                                    type="checkbox"
                                    className="row-checkbox"
                                    checked={selTheory.length === theoryCount && theoryCount > 0}
                                    onChange={() => toggleSelectAll(sem.id, 'theory')}
                                    title="Select all theory"
                                  />
                                </th>
                                <th style={{ width: '42%' }}>Course Name</th>
                                <th style={{ width: '20%' }}>Cr</th>
                                <th style={{ width: '24%' }}>Grade</th>
                                <th style={{ width: '28px' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(sem.theory || []).map((sub, sIdx) => {
                                const isSelected = selTheory.includes(sub.id);
                                return (
                                  <tr 
                                    key={sub.id} 
                                    className={`compact-row ${isSelected ? 'row-selected' : ''}`}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.dataTransfer.dropEffect = 'copy';
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      const droppedGrade = e.dataTransfer.getData('text/plain');
                                      if (droppedGrade && Object.keys(GRADE_POINTS).includes(droppedGrade)) {
                                        updateSubject(sem.id, 'theory', sub.id, 'grade', droppedGrade);
                                        triggerToast(`Set ${sub.name || `Theory ${sIdx + 1}`} to Grade ${droppedGrade}`);
                                      }
                                    }}
                                  >
                                    <td style={{ textAlign: 'center' }}>
                                      <input 
                                        type="checkbox"
                                        className="row-checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelectSubject(sem.id, 'theory', sub.id)}
                                      />
                                    </td>
                                    <td>
                                      <input 
                                        type="text" 
                                        className="compact-input-field name-field"
                                        placeholder={`Theory ${sIdx + 1}`}
                                        value={sub.name}
                                        onChange={(e) => updateSubject(sem.id, 'theory', sub.id, 'name', e.target.value)}
                                      />
                                    </td>
                                    <td>
                                      <input 
                                        type="number"
                                        className="compact-input-field credit-field"
                                        list="credits-options"
                                        min="0"
                                        step="0.5"
                                        value={sub.credits}
                                        onChange={(e) => updateSubject(sem.id, 'theory', sub.id, 'credits', e.target.value ? Number(e.target.value) : "")}
                                      />
                                    </td>
                                    <td>
                                      <select 
                                        className="compact-input-field grade-field"
                                        value={sub.grade}
                                        onChange={(e) => updateSubject(sem.id, 'theory', sub.id, 'grade', e.target.value)}
                                      >
                                        {Object.keys(GRADE_POINTS).map(g => (
                                          <option key={g} value={g}>{g} ({GRADE_POINTS[g]})</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="action-cell">
                                      <button 
                                        className="compact-del-btn" 
                                        onClick={() => removeSubject(sem.id, 'theory', sub.id)}
                                        title="Remove subject"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                              {theoryCount === 0 && (
                                <tr>
                                  <td colSpan="5" className="empty-compact-state">No theory subjects added.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Lab Section */}
                  {(() => {
                    const selLab = getSelectedFor(sem.id, 'lab');
                    const labCount = sem.lab?.length || 0;

                    return (
                      <div className="compact-sub-group">
                        <div className="compact-sub-header">
                          <div className="sub-header-left">
                            <FlaskConical size={14} className="text-accent" />
                            <h4>Lab ({labCount})</h4>
                            <span className="credits-sub-badge">{stats.labCredits} Cr</span>
                          </div>

                          <div className="sub-header-right">
                            {/* Draggable & Clickable Quick Grade Stamper */}
                            {labCount > 0 && (
                              <div className="quick-grade-stamp-bar" title="Click to set all to this grade, or drag chip onto any course">
                                <span className="stamp-label">Set All:</span>
                                {['S', 'A', 'B', 'C'].map(g => (
                                  <span 
                                    key={g}
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData('text/plain', g);
                                      e.dataTransfer.effectAllowed = 'copy';
                                    }}
                                    className={`stamp-chip chip-${g.toLowerCase()}`}
                                    onClick={() => setBatchGrade(sem.id, 'lab', g)}
                                    title={`Set all labs to ${g} (or drag to a course)`}
                                  >
                                    {g}
                                  </span>
                                ))}
                              </div>
                            )}

                            <button 
                              className="compact-add-btn"
                              onClick={() => addSubject(sem.id, 'lab')}
                              title="Add lab course"
                            >
                              <Plus size={13} /> Add
                            </button>

                            {labCount > 0 && (
                              <button 
                                className="compact-clear-btn"
                                onClick={() => clearAllSubjects(sem.id, 'lab')}
                                title="Universal delete: Delete all lab courses"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Floating / Inline Batch Bar if rows selected */}
                        {selLab.length > 0 && (
                          <div className="compact-batch-bar animate-fade-in">
                            <span className="batch-count-tag">{selLab.length} Selected</span>
                            <div className="batch-grade-chips">
                              {['S', 'A', 'B', 'C', 'D'].map(g => (
                                <button 
                                  key={g}
                                  className={`batch-chip chip-${g.toLowerCase()}`}
                                  onClick={() => setBatchGrade(sem.id, 'lab', g, selLab)}
                                  title={`Set selected to ${g}`}
                                >
                                  {g}
                                </button>
                              ))}
                            </div>
                            <button 
                              className="batch-del-btn"
                              onClick={() => deleteSelectedSubjects(sem.id, 'lab')}
                              title="Delete selected courses"
                            >
                              <Trash2 size={12} />
                            </button>
                            <button 
                              className="batch-clear-btn"
                              onClick={() => clearSelection(sem.id, 'lab')}
                              title="Deselect all"
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        <div className="compact-table-wrap">
                          <table className="compact-sub-table">
                            <thead>
                              <tr>
                                <th style={{ width: '28px', textAlign: 'center' }}>
                                  <input 
                                    type="checkbox"
                                    className="row-checkbox"
                                    checked={selLab.length === labCount && labCount > 0}
                                    onChange={() => toggleSelectAll(sem.id, 'lab')}
                                    title="Select all labs"
                                  />
                                </th>
                                <th style={{ width: '42%' }}>Course Name</th>
                                <th style={{ width: '20%' }}>Cr</th>
                                <th style={{ width: '24%' }}>Grade</th>
                                <th style={{ width: '28px' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(sem.lab || []).map((sub, sIdx) => {
                                const isSelected = selLab.includes(sub.id);
                                return (
                                  <tr 
                                    key={sub.id} 
                                    className={`compact-row ${isSelected ? 'row-selected' : ''}`}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.dataTransfer.dropEffect = 'copy';
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      const droppedGrade = e.dataTransfer.getData('text/plain');
                                      if (droppedGrade && Object.keys(GRADE_POINTS).includes(droppedGrade)) {
                                        updateSubject(sem.id, 'lab', sub.id, 'grade', droppedGrade);
                                        triggerToast(`Set ${sub.name || `Lab ${sIdx + 1}`} to Grade ${droppedGrade}`);
                                      }
                                    }}
                                  >
                                    <td style={{ textAlign: 'center' }}>
                                      <input 
                                        type="checkbox"
                                        className="row-checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelectSubject(sem.id, 'lab', sub.id)}
                                      />
                                    </td>
                                    <td>
                                      <input 
                                        type="text" 
                                        className="compact-input-field name-field"
                                        placeholder={`Lab ${sIdx + 1}`}
                                        value={sub.name}
                                        onChange={(e) => updateSubject(sem.id, 'lab', sub.id, 'name', e.target.value)}
                                      />
                                    </td>
                                    <td>
                                      <input 
                                        type="number"
                                        className="compact-input-field credit-field"
                                        list="credits-options"
                                        min="0"
                                        step="0.5"
                                        value={sub.credits}
                                        onChange={(e) => updateSubject(sem.id, 'lab', sub.id, 'credits', e.target.value ? Number(e.target.value) : "")}
                                      />
                                    </td>
                                    <td>
                                      <select 
                                        className="compact-input-field grade-field"
                                        value={sub.grade}
                                        onChange={(e) => updateSubject(sem.id, 'lab', sub.id, 'grade', e.target.value)}
                                      >
                                        {Object.keys(GRADE_POINTS).map(g => (
                                          <option key={g} value={g}>{g} ({GRADE_POINTS[g]})</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="action-cell">
                                      <button 
                                        className="compact-del-btn" 
                                        onClick={() => removeSubject(sem.id, 'lab', sub.id)}
                                        title="Remove subject"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                              {labCount === 0 && (
                                <tr>
                                  <td colSpan="5" className="empty-compact-state">No lab subjects added.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Card Footer Actions */}
                <div className="card-footer-bar">
                  <div className="footer-stats-info">
                    <span>{stats.totalSubjects} Courses</span>
                    <span className="dot-divider">•</span>
                    <span>{stats.credits} Credits</span>
                  </div>

                  <button 
                    className="btn-secondary card-sync-btn"
                    onClick={() => handleSyncSemesterToCGPA(sem)}
                    title={`Push ${sem.name} to CGPA`}
                  >
                    <FileOutput size={14} /> Sync to CGPA
                  </button>
                </div>
              </div>
            );
          })}

          {/* Quick Add Semester Card Card-Slot */}
          <div 
            className="add-semester-card-slot glass-panel"
            onClick={() => addSemester()}
            title="Create another parallel semester"
          >
            <div className="slot-content">
              <div className="slot-icon-box">
                <Plus size={28} />
              </div>
              <h4 className="slot-title">Add Another Semester</h4>
              <p className="slot-desc">Control parallel workloads & side-by-side targets</p>
            </div>
          </div>
        </div>
      )}

      {/* Datalist for fast credit auto-suggest */}
      <datalist id="credits-options">
        {[1, 1.5, 2, 3, 4, 5, 6, 9, 20].map(c => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );

  // Helper for Single Focused View full-width tables
  function renderFullSubjectTable(sem, type) {
    const subjects = sem[type] || [];
    const isTheory = type === 'theory';
    const selSubs = getSelectedFor(sem.id, type);

    return (
      <div className="subject-section glass-panel animate-fade-in" key={type}>
        <div className="section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isTheory ? <BookOpen size={20} className="text-accent" /> : <FlaskConical size={20} className="text-accent" />}
            <h2>{isTheory ? 'Theory Subjects' : 'Lab Subjects'} ({subjects.length})</h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Draggable & Clickable Quick Grade Stamper */}
            {subjects.length > 0 && (
              <div className="quick-grade-stamp-bar full-view-stamp" title="Click to set all to this grade, or drag onto any course">
                <span className="stamp-label">Set All:</span>
                {['S', 'A', 'B', 'C', 'D'].map(g => (
                  <span
                    key={g}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', g);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className={`stamp-chip chip-${g.toLowerCase()}`}
                    onClick={() => setBatchGrade(sem.id, type, g)}
                    title={`Click to set all to ${g}, or drag onto a course`}
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            <button className="btn-secondary add-btn" onClick={() => addSubject(sem.id, type)}>
              <Plus size={16} /> Add Subject
            </button>

            {subjects.length > 0 && (
              <button 
                className="btn-secondary clear-all-btn" 
                onClick={() => clearAllSubjects(sem.id, type)}
                title={`Universal delete: Delete all ${isTheory ? 'theory' : 'lab'} courses`}
              >
                <Trash2 size={15} /> Clear All
              </button>
            )}
          </div>
        </div>

        {/* Floating Batch Action Bar when rows are selected */}
        {selSubs.length > 0 && (
          <div className="full-batch-bar glass-panel animate-fade-in">
            <span className="batch-count-tag">{selSubs.length} Selected</span>
            <span className="batch-label">Set Grade:</span>
            <div className="batch-grade-chips">
              {Object.keys(GRADE_POINTS).map(g => (
                <button 
                  key={g}
                  className={`batch-chip chip-${g.toLowerCase()}`}
                  onClick={() => setBatchGrade(sem.id, type, g, selSubs)}
                  title={`Set selected to ${g}`}
                >
                  {g}
                </button>
              ))}
            </div>
            <button 
              className="btn-secondary batch-del-btn"
              onClick={() => deleteSelectedSubjects(sem.id, type)}
              title="Delete selected courses"
            >
              <Trash2 size={14} /> Delete Selected
            </button>
            <button 
              className="btn-secondary batch-clear-btn"
              onClick={() => clearSelection(sem.id, type)}
              title="Clear selection"
            >
              ✕ Clear
            </button>
          </div>
        )}
        
        <div className="table-responsive">
          <table className="subjects-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input 
                    type="checkbox"
                    className="row-checkbox"
                    checked={selSubs.length === subjects.length && subjects.length > 0}
                    onChange={() => toggleSelectAll(sem.id, type)}
                    title="Select all"
                  />
                </th>
                <th>Subject Name (Optional)</th>
                <th>Credits</th>
                <th>Grade</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((sub, index) => {
                const isSelected = selSubs.includes(sub.id);
                return (
                  <tr 
                    key={sub.id} 
                    className={`animate-fade-in ${isSelected ? 'row-selected' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const droppedGrade = e.dataTransfer.getData('text/plain');
                      if (droppedGrade && Object.keys(GRADE_POINTS).includes(droppedGrade)) {
                        updateSubject(sem.id, type, sub.id, 'grade', droppedGrade);
                        triggerToast(`Set ${sub.name || `${isTheory ? 'Theory' : 'Lab'} ${index + 1}`} to Grade ${droppedGrade}`);
                      }
                    }}
                  >
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        type="checkbox"
                        className="row-checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectSubject(sem.id, type, sub.id)}
                      />
                    </td>
                    <td>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder={`${isTheory ? 'Theory' : 'Lab'} Sub ${index + 1}`}
                        value={sub.name}
                        onChange={(e) => updateSubject(sem.id, type, sub.id, 'name', e.target.value)}
                      />
                    </td>
                    <td>
                      <input 
                        type="number"
                        className="input-field" 
                        list="credits-options"
                        min="0"
                        step="0.5"
                        value={sub.credits}
                        onChange={(e) => updateSubject(sem.id, type, sub.id, 'credits', e.target.value ? Number(e.target.value) : "")}
                        placeholder="Credits"
                        style={{ padding: '8px' }}
                      />
                    </td>
                    <td style={{ minWidth: '150px' }}>
                      <select 
                        className="input-field" 
                        value={sub.grade}
                        onChange={(e) => updateSubject(sem.id, type, sub.id, 'grade', e.target.value)}
                      >
                        {Object.keys(GRADE_POINTS).map(g => (
                          <option key={g} value={g}>{g} ({GRADE_POINTS[g]})</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button className="delete-btn" onClick={() => removeSubject(sem.id, type, sub.id)} title="Delete subject">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {subjects.length === 0 && (
                <tr>
                  <td colSpan="5" className="empty-state">No {isTheory ? 'theory' : 'lab'} subjects added.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
}
