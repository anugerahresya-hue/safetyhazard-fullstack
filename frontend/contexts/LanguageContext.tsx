"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "en" | "id";

// Comprehensive translations for the entire SafetyHazard application
const TRANSLATIONS = {
  en: {
    // Navigation & Sidebar
    nav: {
      dashboard: "Dashboard",
      hazard_analyzer: "Hazard Analyzer",
      reports: "Reports",
      ehss_knowledge: "EHSS Knowledge",
      user_management: "User Management",
      admin: "Admin",
      settings: "Settings",
      sign_out: "Sign Out",
      logout: "Logout",
      expand: "Expand",
      collapse: "Collapse",
      light_mode: "Light mode",
      dark_mode: "Dark mode",
      view_as: "VIEW AS",
    },
    // Dashboard page
    dashboard: {
      title: "Dashboard",
      greeting: "Good day",
      subtitle: "Real-time hazard visibility across all Mattel manufacturing sites.",
      export_report: "Export Report",
      todays_inspections: "TODAY'S INSPECTIONS",
      critical_findings: "CRITICAL FINDINGS",
      analyzed: "ANALYZED",
      reported: "REPORTED",
      active_vs_yesterday: "Active vs yesterday",
      open_needs_action: "Open - needs action",
      across_all_areas: "Across all areas",
      awaiting_review: "Awaiting review",
      hazard_trend: "Hazard Trend (Overview)",
      recent_activity: "Recent Activity",
      no_activity: "No recent activity found.",
      no_inspections: "No inspections yet. Data will appear here.",
      active_hazards: "Active Hazards",
      ppe_violations: "PPE Violations",
      critical_high: "Critical / High",
      inspections: "Inspections",
    },
    // Hazard Analyzer
    analyzer: {
      title: "Hazard Analyzer",
      subtitle: "Upload a video or use the camera to detect workplace hazards.",
      upload_tab: "Upload Video",
      camera_tab: "Live Camera",
      location_label: "LOCATION",
      location_placeholder: "e.g. Building B",
      area_label: "AREA",
      area_placeholder: "Select area",
      areas: {
        spray: "Spray/Decoration Area",
        staging: "Central Staging Area",
        assembly: "Assembly Area",
        general: "General",
      },
      analyze_button: "Analyze for Hazards",
      analyzing: "Analyzing...",
      results_title: "Detection Results",
      no_hazards: "No hazards detected.",
      confidence: "Confidence",
      risk_level: "Risk Level",
      corrective_action: "Corrective Action",
    },
    // Reports
    reports: {
      title: "Inspection Reports",
      subtitle: "Auto-generated from every detection. Export to PDF for audit.",
      export_excel: "Export Excel",
      download_pdf: "Download PDF",
      print: "Print",
      no_reports: "No analyzed inspections yet.",
      inspector_only: "Only Inspector can generate reports.",
      filter_all: "All Reports",
      filter_critical: "Critical",
      filter_high: "High Risk",
      filter_analyzed: "Analyzed",
      filter_reported: "Reported",
      table_date: "Date",
      table_location: "Location",
      table_inspector: "Inspector",
      table_status: "Status",
      table_risk: "Risk",
      table_issues: "Issues",
      loading: "Loading reports...",
      no_match: "No reports match this filter.",
    },
    // EHSS Knowledge / Chatbot
    ehss: {
      title: "EHSS Knowledge Base",
      subtitle: "Ask the AI about OSHA 1910 / EHSS, or manage reference documents.",
      page_title: "EHSS Knowledge",
      page_subtitle: "Search safety documentation and ask the AI assistant",
      tab_chat: "Ask AI",
      tab_docs: "Documents",
      chatbot_title: "EHSS AI Assistant",
      chatbot_subtitle: "Powered by your knowledge base",
      welcome_message:
        "Hello! I am the EHSS Safety Assistant. Select a topic below or type your question directly.",
      input_placeholder: "Ask about safety procedures, hazards, PPE...",
      search_other: "Search Another Topic",
      back_to_menu: "Back to Main Menu",
      sources_title: "Sources",
      submenu_intro: "Here are some questions about",
      thinking: "Looking up answer...",
      upload_doc_title: "Upload New Document",
      doc_title_label: "Document Title",
      doc_title_placeholder: "e.g. OSHA PPE Standard 2024",
      doc_category_label: "Category",
      upload_button: "Upload Document",
      no_docs: "No documents uploaded yet.",
      categories: {
        PPE: "PPE",
        Housekeeping: "Housekeeping",
        Emergency: "Emergency",
        "Chemical Safety": "Chemical Safety",
        "Machine Safety": "Machine Safety",
        "Electrical Safety": "Electrical Safety",
        "Fire Safety": "Fire Safety",
        "Fall Protection": "Fall Protection",
      },
      questions: {
        PPE: [
          "What PPE is required in the Spray/Decoration Area?",
          "What PPE is required in the Central Staging Area?",
          "What are the general PPE requirements under OSHA 1910.132?",
          "How should PPE be inspected before use?",
        ],
        Housekeeping: [
          "What are the housekeeping standards for production areas?",
          "How should spills be handled immediately?",
          "What is the procedure for wet floor hazard reporting?",
        ],
        Emergency: [
          "What is the emergency evacuation procedure?",
          "Where are the emergency exits located?",
          "What are the requirements for emergency action plans under OSHA 1910.38?",
        ],
        "Chemical Safety": [
          "What are the chemical handling requirements in the Spray Area?",
          "How should hazardous chemicals be stored?",
          "What does OSHA 1910.1200 require for hazard communication?",
        ],
        "Machine Safety": [
          "What are the machine guarding requirements under OSHA 1910.212?",
          "What is the lockout/tagout procedure?",
          "How should machinery be inspected before operation?",
        ],
        "Electrical Safety": [
          "What are the electrical safety requirements under OSHA 1910.303?",
          "How should electrical hazards be reported?",
          "What PPE is required for electrical work?",
        ],
        "Fire Safety": [
          "What are the fire prevention requirements under OSHA 1910.39?",
          "How should fire extinguishers be maintained?",
          "What is the fire evacuation procedure?",
        ],
        "Fall Protection": [
          "What are the fall protection requirements under OSHA 1910.28?",
          "When is a safety harness required?",
          "How should ladders be used safely?",
        ],
      },
    },
    // User Management
    users: {
      title: "User Management",
      approve: "Approve",
      reject: "Reject",
      delete: "Delete",
      status_pending: "Pending",
      status_active: "Active",
      status_inactive: "Inactive",
      role_admin: "Administrator",
      role_inspector: "Safety Inspector",
      role_manager: "EHSS Manager",
    },
    // Common
    common: {
      loading: "Loading...",
      error: "An error occurred.",
      save: "Save",
      cancel: "Cancel",
      confirm: "Confirm",
      back: "Back",
      next: "Next",
      submit: "Submit",
      download: "Download",
      upload: "Upload",
      delete: "Delete",
      edit: "Edit",
      view: "View",
      search: "Search",
      filter: "Filter",
      no_data: "No data available.",
    },
  },
  id: {
    nav: {
      dashboard: "Dasbor",
      hazard_analyzer: "Analisis Bahaya",
      reports: "Laporan",
      ehss_knowledge: "Pengetahuan EHSS",
      user_management: "Manajemen Pengguna",
      admin: "Admin",
      settings: "Pengaturan",
      sign_out: "Keluar",
      logout: "Keluar",
      expand: "Perluas",
      collapse: "Ciutkan",
      light_mode: "Mode terang",
      dark_mode: "Mode gelap",
      view_as: "LIHAT SEBAGAI",
    },
    dashboard: {
      title: "Dasbor",
      greeting: "Selamat datang",
      subtitle:
        "Visibilitas bahaya real-time di semua fasilitas manufaktur Mattel.",
      export_report: "Ekspor Laporan",
      todays_inspections: "INSPEKSI HARI INI",
      critical_findings: "TEMUAN KRITIS",
      analyzed: "DIANALISIS",
      reported: "DILAPORKAN",
      active_vs_yesterday: "Aktif vs kemarin",
      open_needs_action: "Terbuka - perlu tindakan",
      across_all_areas: "Di semua area",
      awaiting_review: "Menunggu tinjauan",
      hazard_trend: "Tren Bahaya (Ikhtisar)",
      recent_activity: "Aktivitas Terbaru",
      no_activity: "Tidak ada aktivitas terbaru.",
      no_inspections: "Belum ada inspeksi. Data akan muncul di sini.",
      active_hazards: "Bahaya Aktif",
      ppe_violations: "Pelanggaran APD",
      critical_high: "Kritis / Tinggi",
      inspections: "Inspeksi",
    },
    analyzer: {
      title: "Analisis Bahaya",
      subtitle:
        "Upload video atau gunakan kamera untuk mendeteksi bahaya kerja.",
      upload_tab: "Upload Video",
      camera_tab: "Kamera Live",
      location_label: "LOKASI",
      location_placeholder: "cth. Gedung B",
      area_label: "AREA",
      area_placeholder: "Pilih area",
      areas: {
        spray: "Area Spray/Dekorasi",
        staging: "Central Staging Area",
        assembly: "Area Assembly",
        general: "Umum",
      },
      analyze_button: "Analisis Bahaya",
      analyzing: "Menganalisis...",
      results_title: "Hasil Deteksi",
      no_hazards: "Tidak ada bahaya terdeteksi.",
      confidence: "Kepercayaan",
      risk_level: "Tingkat Risiko",
      corrective_action: "Tindakan Korektif",
    },
    reports: {
      title: "Laporan Inspeksi",
      subtitle:
        "Dibuat otomatis dari setiap deteksi. Ekspor ke PDF untuk audit.",
      export_excel: "Ekspor Excel",
      download_pdf: "Unduh PDF",
      print: "Cetak",
      no_reports: "Belum ada inspeksi yang dianalisis.",
      inspector_only: "Hanya Inspektor yang dapat membuat laporan.",
      filter_all: "Semua Laporan",
      filter_critical: "Kritis",
      filter_high: "Risiko Tinggi",
      filter_analyzed: "Dianalisis",
      filter_reported: "Dilaporkan",
      table_date: "Tanggal",
      table_location: "Lokasi",
      table_inspector: "Inspektor",
      table_status: "Status",
      table_risk: "Risiko",
      table_issues: "Masalah",
      loading: "Memuat laporan...",
      no_match: "Tidak ada laporan yang cocok dengan filter ini.",
    },
    ehss: {
      title: "Basis Pengetahuan EHSS",
      subtitle:
        "Tanya AI tentang OSHA 1910 / EHSS, atau kelola dokumen referensi.",
      page_title: "Pengetahuan EHSS",
      page_subtitle: "Cari dokumentasi keselamatan dan tanya asisten AI",
      tab_chat: "Tanya AI",
      tab_docs: "Dokumen",
      chatbot_title: "Asisten AI EHSS",
      chatbot_subtitle: "Didukung oleh basis pengetahuan Anda",
      welcome_message:
        "Halo! Saya Asisten Keselamatan EHSS. Pilih topik di bawah atau ketik pertanyaan Anda langsung.",
      input_placeholder: "Tanya tentang prosedur keselamatan, bahaya, APD...",
      search_other: "Cari Topik Lain",
      back_to_menu: "Kembali ke Menu Utama",
      sources_title: "Sumber",
      submenu_intro: "Berikut beberapa pertanyaan tentang",
      thinking: "Mencari jawaban...",
      upload_doc_title: "Upload Dokumen Baru",
      doc_title_label: "Judul Dokumen",
      doc_title_placeholder: "cth. Standar APD OSHA 2024",
      doc_category_label: "Kategori",
      upload_button: "Upload Dokumen",
      no_docs: "Belum ada dokumen yang diupload.",
      categories: {
        PPE: "APD",
        Housekeeping: "Kebersihan",
        Emergency: "Darurat",
        "Chemical Safety": "Keselamatan Kimia",
        "Machine Safety": "Keselamatan Mesin",
        "Electrical Safety": "Keselamatan Listrik",
        "Fire Safety": "Keselamatan Kebakaran",
        "Fall Protection": "Perlindungan Jatuh",
      },
      questions: {
        PPE: [
          "APD apa yang wajib digunakan di Area Spray/Dekorasi?",
          "APD apa yang wajib digunakan di Central Staging Area?",
          "Apa persyaratan APD umum berdasarkan OSHA 1910.132?",
          "Bagaimana cara memeriksa APD sebelum digunakan?",
        ],
        Housekeeping: [
          "Apa standar kebersihan untuk area produksi?",
          "Bagaimana cara menangani tumpahan dengan segera?",
          "Apa prosedur pelaporan bahaya lantai basah?",
        ],
        Emergency: [
          "Apa prosedur evakuasi darurat?",
          "Di mana letak pintu darurat?",
          "Apa persyaratan rencana tindakan darurat berdasarkan OSHA 1910.38?",
        ],
        "Chemical Safety": [
          "Apa persyaratan penanganan bahan kimia di Area Spray?",
          "Bagaimana cara menyimpan bahan kimia berbahaya?",
          "Apa yang disyaratkan OSHA 1910.1200 untuk komunikasi bahaya?",
        ],
        "Machine Safety": [
          "Apa persyaratan pengaman mesin berdasarkan OSHA 1910.212?",
          "Apa prosedur lockout/tagout?",
          "Bagaimana cara memeriksa mesin sebelum dioperasikan?",
        ],
        "Electrical Safety": [
          "Apa persyaratan keselamatan listrik berdasarkan OSHA 1910.303?",
          "Bagaimana cara melaporkan bahaya listrik?",
          "APD apa yang diperlukan untuk pekerjaan kelistrikan?",
        ],
        "Fire Safety": [
          "Apa persyaratan pencegahan kebakaran berdasarkan OSHA 1910.39?",
          "Bagaimana cara merawat alat pemadam kebakaran?",
          "Apa prosedur evakuasi kebakaran?",
        ],
        "Fall Protection": [
          "Apa persyaratan perlindungan jatuh berdasarkan OSHA 1910.28?",
          "Kapan harness keselamatan wajib digunakan?",
          "Bagaimana cara menggunakan tangga dengan aman?",
        ],
      },
    },
    users: {
      title: "Manajemen Pengguna",
      approve: "Setujui",
      reject: "Tolak",
      delete: "Hapus",
      status_pending: "Menunggu",
      status_active: "Aktif",
      status_inactive: "Tidak Aktif",
      role_admin: "Administrator",
      role_inspector: "Inspektor Keselamatan",
      role_manager: "Manajer EHSS",
    },
    common: {
      loading: "Memuat...",
      error: "Terjadi kesalahan.",
      save: "Simpan",
      cancel: "Batal",
      confirm: "Konfirmasi",
      back: "Kembali",
      next: "Berikutnya",
      submit: "Kirim",
      download: "Unduh",
      upload: "Upload",
      delete: "Hapus",
      edit: "Edit",
      view: "Lihat",
      search: "Cari",
      filter: "Filter",
      no_data: "Tidak ada data.",
    },
  },
} as const;

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: typeof TRANSLATIONS["en"] | typeof TRANSLATIONS["id"];
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");
  const [mounted, setMounted] = useState(false);

  // Load language preference from localStorage on mount (SSR-safe)
  useEffect(() => {
    const saved = localStorage.getItem("safetyvision_lang");
    if (saved === "en" || saved === "id") {
      setLangState(saved);
    }
    setMounted(true);
  }, []);

  // Save language preference to localStorage when it changes
  const setLang = (newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("safetyvision_lang", newLang);
    }
  };

  const toggleLang = () => {
    setLang(lang === "en" ? "id" : "en");
  };

  const t = TRANSLATIONS[lang];

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLang must be used within a LanguageProvider");
  }
  return context;
}

// Keep backward compatibility
export const useLanguage = useLang;
