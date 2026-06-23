"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import Navbar from "../../components/Navbar";
import ProtectedRoute from "../../components/ProtectedRoute";
import { db } from "../../lib/firebase";
import {
  collection,
  query,
  onSnapshot,
  doc,
  setDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { createNotification } from "../../lib/notifications";

// ── Preset tech stack / skill badges (mirrors /profile and /user/[uid]) ───────
const SKILL_PRESETS = [
  { key: "frontend",   label: "Frontend Developer",   color: "#3b82f6" },
  { key: "backend",    label: "Backend Developer",    color: "#8b5cf6" },
  { key: "fullstack",  label: "Full Stack Developer", color: "#10b981" },
  { key: "mobile",     label: "Mobile Developer",     color: "#f97316" },
  { key: "devops",     label: "DevOps Engineer",      color: "#ef4444" },
  { key: "ai_ml",      label: "AI / ML Engineer",     color: "#06b6d4" },
  { key: "design",     label: "UI/UX Designer",       color: "#ec4899" },
  { key: "data",       label: "Data Scientist",       color: "#eab308" },
  { key: "blockchain", label: "Blockchain Dev",       color: "#6366f1" },
];
function getSkillMeta(key) {
  return SKILL_PRESETS.find((s) => s.key === key) || { key, label: key, color: "#64748b" };
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

const S = {
  page: { minHeight: "100vh", backgroundColor: "var(--bg-primary)" },
  container: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "32px 24px 56px",
  },
  containerMobile: {
    maxWidth: "100%",
    padding: "20px 14px 48px",
  },
  headerRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 24,
  },
  title: {
    color: "var(--text-primary)",
    fontSize: "1.6rem",
    fontWeight: 800,
    margin: 0,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  subtitle: {
    color: "var(--text-muted)",
    fontSize: "0.9rem",
    margin: 0,
  },

  // ── Filters bar ──
  filtersCard: {
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-lg)",
    padding: 16,
    marginBottom: 22,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  searchInputWrap: { position: "relative" },
  searchInput: {
    width: "100%",
    padding: "10px 14px 10px 38px",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-primary)",
    outline: "none",
    fontSize: "0.9rem",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: "translateY(-50%)",
    color: "var(--text-muted)",
    fontSize: "0.9rem",
    pointerEvents: "none",
  },
  filterRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  filterLabel: {
    color: "var(--text-muted)",
    fontSize: "0.74rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginRight: 4,
    flexShrink: 0,
  },
  skillChip: (active, color) => ({
    padding: "5px 13px",
    borderRadius: "var(--radius-full)",
    border: `1px solid ${active ? color : "var(--border-color)"}`,
    background: active ? `${color}22` : "transparent",
    color: active ? color : "var(--text-secondary)",
    fontSize: "0.78rem",
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  }),
  collabChip: (active) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 13px",
    borderRadius: "var(--radius-full)",
    border: `1px solid ${active ? "#22c55e" : "var(--border-color)"}`,
    background: active ? "rgba(34,197,94,0.14)" : "transparent",
    color: active ? "#22c55e" : "var(--text-secondary)",
    fontSize: "0.78rem",
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  }),
  clearBtn: {
    padding: "5px 13px",
    borderRadius: "var(--radius-full)",
    border: "1px solid var(--border-color)",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: "0.78rem",
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  resultsCount: {
    color: "var(--text-muted)",
    fontSize: "0.82rem",
    marginBottom: 14,
  },

  // ── Grid ──
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 16,
  },
  gridMobile: {
    gridTemplateColumns: "1fr",
  },

  // ── User card ──
  userCard: {
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-lg)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxShadow: "var(--shadow-sm)",
    transition: "border-color 0.15s, transform 0.15s",
  },
  cardTopRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: "var(--radius-full)",
    background: "linear-gradient(135deg, var(--accent-primary), var(--accent-ai))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#000",
    fontWeight: 700,
    fontSize: "1.2rem",
    border: "2px solid var(--border-color)",
    flexShrink: 0,
    overflow: "hidden",
    cursor: "pointer",
  },
  cardInfo: { flex: 1, minWidth: 0 },
  cardName: {
    color: "var(--text-primary)",
    fontWeight: 700,
    fontSize: "1rem",
    margin: 0,
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: "0.74rem",
    color: "var(--text-muted)",
    marginTop: 2,
  },
  cardBio: {
    color: "var(--text-secondary)",
    fontSize: "0.84rem",
    lineHeight: 1.5,
    margin: 0,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  cardBioEmpty: {
    color: "var(--text-muted)",
    fontSize: "0.84rem",
    fontStyle: "italic",
    margin: 0,
  },
  cardSkills: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  skillBadge: (color) => ({
    padding: "3px 10px",
    borderRadius: "var(--radius-full)",
    border: `1px solid ${color}55`,
    background: `${color}1a`,
    color,
    fontSize: "0.7rem",
    fontWeight: 600,
  }),
  collabBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: "var(--radius-full)",
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.4)",
    color: "#22c55e",
    fontSize: "0.7rem",
    fontWeight: 600,
    width: "fit-content",
  },
  cardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
    paddingTop: 12,
    borderTop: "1px solid var(--border-color)",
  },
  cardStats: {
    display: "flex",
    gap: 12,
    fontSize: "0.76rem",
    color: "var(--text-muted)",
  },
  btnFollow: {
    padding: "6px 16px",
    backgroundColor: "var(--accent-primary)",
    border: "none",
    borderRadius: "var(--radius-md)",
    color: "#000",
    fontWeight: 700,
    fontSize: "0.8rem",
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  btnUnfollow: {
    padding: "6px 16px",
    backgroundColor: "transparent",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-secondary)",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },

  // ── Empty / loading ──
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "64px 24px",
    color: "var(--text-muted)",
    textAlign: "center",
  },
  loadingRow: {
    textAlign: "center",
    padding: "64px 24px",
    color: "var(--text-muted)",
    fontSize: "0.9rem",
  },
};

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ photoURL, displayName, onClick }) {
  return (
    <div style={S.avatar} onClick={onClick} title="View profile">
      {photoURL
        ? <img src={photoURL} alt={displayName || "avatar"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : (displayName?.charAt(0)?.toUpperCase() || "U")}
    </div>
  );
}

// ── Developer card ─────────────────────────────────────────────────────────────
function DeveloperCard({ person, currentUser, isFollowing, onFollowToggle, onOpenProfile }) {
  const skills = Array.isArray(person.skills) ? person.skills : [];
  const followersCount = (person.followers || []).length;
  const isSelf = currentUser?.uid === person.uid;

  return (
    <div
      style={S.userCard}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-primary)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; }}
    >
      <div style={S.cardTopRow}>
        <Avatar photoURL={person.photoURL} displayName={person.displayName} onClick={() => onOpenProfile(person.uid)} />
        <div style={S.cardInfo}>
          <p style={S.cardName} onClick={() => onOpenProfile(person.uid)}>
            {person.displayName || "Anonymous User"}
          </p>
          <div style={S.cardMetaRow}>
            <span>{followersCount} follower{followersCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      {person.bio
        ? <p style={S.cardBio}>{person.bio}</p>
        : <p style={S.cardBioEmpty}>No bio yet.</p>}

      {(skills.length > 0 || person.openToCollaborate) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {person.openToCollaborate && (
            <span style={S.collabBadge}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
              Open to Collaborate
            </span>
          )}
          {skills.length > 0 && (
            <div style={S.cardSkills}>
              {skills.map((key) => {
                const meta = getSkillMeta(key);
                return <span key={key} style={S.skillBadge(meta.color)}>{meta.label}</span>;
              })}
            </div>
          )}
        </div>
      )}

      <div style={S.cardFooter}>
        <button
          style={{ ...S.btnUnfollow, padding: "6px 14px" }}
          onClick={() => onOpenProfile(person.uid)}
        >
          View Profile
        </button>
        {!isSelf && currentUser && (
          <button
            style={isFollowing ? S.btnUnfollow : S.btnFollow}
            onClick={() => onFollowToggle(person.uid, isFollowing)}
          >
            {isFollowing ? "✓ Following" : "+ Follow"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DevelopersPage() {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [allUsers, setAllUsers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [following, setFollowing] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [activeSkills, setActiveSkills] = useState([]);
  const [collabOnly, setCollabOnly] = useState(false);

  // ── Load all users ────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "users"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAllUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
        setLoaded(true);
      },
      (err) => {
        console.error("Failed to load developers:", err);
        setLoaded(true);
      }
    );
    return () => unsub();
  }, []);

  // ── Track current user's following list live ─────────────────────────────
  useEffect(() => {
    if (!user) { setFollowing([]); return; }
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setFollowing(snap.data()?.following || []);
    });
    return () => unsub();
  }, [user]);

  // ── Follow / Unfollow ─────────────────────────────────────────────────────
  const handleFollowToggle = useCallback(async (targetUid, isCurrentlyFollowing) => {
    if (!user || !targetUid || targetUid === user.uid) return;
    try {
      await setDoc(doc(db, "users", user.uid), {
        following: isCurrentlyFollowing ? arrayRemove(targetUid) : arrayUnion(targetUid),
      }, { merge: true });
      await setDoc(doc(db, "users", targetUid), {
        followers: isCurrentlyFollowing ? arrayRemove(user.uid) : arrayUnion(user.uid),
      }, { merge: true });
      if (!isCurrentlyFollowing) {
        await createNotification({ toUid: targetUid, fromUser: user, type: "follow" });
      }
    } catch (err) {
      console.error("Follow toggle failed:", err);
    }
  }, [user]);

  const openProfile = useCallback((uid) => {
    if (user && uid === user.uid) {
      router.push("/profile");
    } else {
      router.push(`/user/${uid}`);
    }
  }, [router, user]);

  const toggleSkillFilter = (key) => {
    setActiveSkills((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  };

  const clearFilters = () => {
    setSearchTerm("");
    setActiveSkills([]);
    setCollabOnly(false);
  };

  const hasActiveFilters = searchTerm.trim() || activeSkills.length > 0 || collabOnly;

  // ── Filtered + searched results ───────────────────────────────────────────
  const results = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return allUsers
      .filter((p) => p.uid !== user?.uid) // exclude self from directory
      .filter((p) => {
        if (term) {
          const inName = p.displayName?.toLowerCase().includes(term);
          const inBio = p.bio?.toLowerCase().includes(term);
          const inSkills = (p.skills || []).some((s) => getSkillMeta(s).label.toLowerCase().includes(term));
          if (!inName && !inBio && !inSkills) return false;
        }
        if (collabOnly && !p.openToCollaborate) return false;
        if (activeSkills.length > 0) {
          const personSkills = p.skills || [];
          const matchesAll = activeSkills.every((s) => personSkills.includes(s));
          if (!matchesAll) return false;
        }
        return true;
      })
      .sort((a, b) => (b.followers?.length || 0) - (a.followers?.length || 0));
  }, [allUsers, searchTerm, activeSkills, collabOnly, user]);

  const ctr = isMobile ? { ...S.container, ...S.containerMobile } : S.container;
  const gridStyle = isMobile ? { ...S.grid, ...S.gridMobile } : S.grid;

  return (
    <ProtectedRoute>
      <main style={S.page}>
        <Navbar variant="dashboard" />

        <div style={ctr}>
          <div style={S.headerRow}>
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
    <h1 style={S.title}>👥 Discover Developers</h1>
    <Link href="/dashboard" style={S.btnUnfollow}>← Back to Dashboard</Link>
  </div>
  <p style={S.subtitle}>Find people by tech stack, skills, or collaboration status.</p>
</div>

          {/* ── Filters ── */}
          <div style={S.filtersCard}>
            <div style={S.searchInputWrap}>
              <span style={S.searchIcon}>🔍</span>
              <input
                type="text"
                placeholder="Search by name, bio, or skill..."
                style={S.searchInput}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={S.filterRow}>
              <span style={S.filterLabel}>Tech Stack</span>
              {SKILL_PRESETS.map((s) => (
                <button
                  key={s.key}
                  style={S.skillChip(activeSkills.includes(s.key), s.color)}
                  onClick={() => toggleSkillFilter(s.key)}
                >
                  {activeSkills.includes(s.key) ? "✓ " : ""}{s.label}
                </button>
              ))}
            </div>

            <div style={S.filterRow}>
              <span style={S.filterLabel}>Status</span>
              <button style={S.collabChip(collabOnly)} onClick={() => setCollabOnly((v) => !v)}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: collabOnly ? "#22c55e" : "var(--text-muted)", flexShrink: 0 }} />
                Open to Collaborate
              </button>
              {hasActiveFilters && (
                <button style={S.clearBtn} onClick={clearFilters}>✕ Clear filters</button>
              )}
            </div>
          </div>

          {/* ── Results ── */}
          {!loaded ? (
            <div style={S.loadingRow}>Loading developers…</div>
          ) : results.length === 0 ? (
            <div style={S.emptyState}>
              <div style={{ fontSize: "2.4rem" }}>🔍</div>
              <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>No developers found</div>
              <div style={{ fontSize: "0.85rem" }}>
                {hasActiveFilters ? "Try adjusting your filters or search term." : "No other registered users yet."}
              </div>
              {hasActiveFilters && (
                <button style={{ ...S.clearBtn, marginTop: 4 }} onClick={clearFilters}>Clear filters</button>
              )}
            </div>
          ) : (
            <>
              <div style={S.resultsCount}>
                {results.length} developer{results.length !== 1 ? "s" : ""} found
              </div>
              <div style={gridStyle}>
                {results.map((person) => (
                  <DeveloperCard
                    key={person.uid}
                    person={person}
                    currentUser={user}
                    isFollowing={following.includes(person.uid)}
                    onFollowToggle={handleFollowToggle}
                    onOpenProfile={openProfile}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}