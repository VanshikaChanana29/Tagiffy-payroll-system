import React, { useState, useEffect } from 'react';
import { PartyPopper, X, Cake } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { fetchTodaysBirthdays } from '../../api/birthdays';
import { buildInitialsAvatar } from '../../utils/initialsAvatar';

const CONFETTI_COLORS = ['#f97316', '#fb923c', '#fbbf24', '#34d399', '#60a5fa', '#f472b6'];

const Confetti = () => {
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 2.5 + Math.random() * 2,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 6 + Math.random() * 6,
    rotate: Math.random() * 360,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: '-20px',
            width: p.size,
            height: p.size * 0.4,
            backgroundColor: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `birthday-confetti-fall ${p.duration}s ${p.delay}s linear infinite`,
          }}
        />
      ))}
    </div>
  );
};

const BirthdayPopup = () => {
  const { user } = useAuth();
  const [birthdays, setBirthdays] = useState([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;

    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const dismissedKey = `taggify_birthday_dismissed_${todayKey}`;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(dismissedKey) === 'true';
    } catch {
      // Private browsing / blocked storage — treat as not dismissed.
    }
    if (dismissed) return;

    fetchTodaysBirthdays()
      .then((res) => {
        const list = res.data.birthdays || [];
        if (list.length > 0) {
          setBirthdays(list);
          setVisible(true);
        }
      })
      .catch(() => {
        // Silent — a missed birthday popup isn't worth surfacing an error for.
      });
  }, [user]);

  const dismiss = () => {
    setVisible(false);
    try {
      const todayKey = format(new Date(), 'yyyy-MM-dd');
      localStorage.setItem(`taggify_birthday_dismissed_${todayKey}`, 'true');
    } catch {
      // Ignore — worst case the popup reappears this session.
    }
  };

  if (!visible || birthdays.length === 0) return null;

  const currentUserId = (user?._id || user?.id || '').toString();
  const selfBirthday = birthdays.find((b) => b._id === currentUserId);
  const others = birthdays.filter((b) => b._id !== currentUserId);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
      <style>{`
        @keyframes birthday-confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(420px) rotate(360deg); opacity: 0; }
        }
        @keyframes birthday-cake-bounce {
          0%, 100% { transform: translateY(0) rotate(-6deg); }
          50% { transform: translateY(-10px) rotate(6deg); }
        }
      `}</style>

      <div className="relative w-full max-w-md rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-orange-700 text-white shadow-glow overflow-hidden">
        <Confetti />

        <button
          type="button"
          onClick={dismiss}
          aria-label="Close birthday popup"
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative z-[1] p-8 sm:p-10 text-center space-y-4">
          <div
            className="text-6xl inline-block"
            style={{ animation: 'birthday-cake-bounce 1.4s ease-in-out infinite' }}
          >
            🎂
          </div>

          {selfBirthday ? (
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold flex items-center justify-center gap-2">
                <PartyPopper className="w-6 h-6" />
                Happy Birthday, {selfBirthday.name.split(' ')[0]}!
              </h2>
              <p className="text-white/85 text-sm mt-2">
                Wishing you a fantastic day from the whole Taggify team. Enjoy it! 🎉
              </p>
            </div>
          ) : (
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold flex items-center justify-center gap-2">
                <Cake className="w-6 h-6" />
                {others.length === 1 ? "It's a birthday today!" : "It's birthday time!"}
              </h2>
              <p className="text-white/85 text-sm mt-1">
                Take a moment to wish {others.length === 1 ? 'them' : 'the team'} well 🎉
              </p>
            </div>
          )}

          {others.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {others.map((b) => (
                <div
                  key={b._id}
                  className="flex items-center gap-2 bg-white/15 border border-white/25 rounded-xl px-3 py-2"
                >
                  <img
                    src={b.avatar || buildInitialsAvatar(b.name)}
                    alt={b.name}
                    className="w-8 h-8 rounded-lg object-cover border border-white/40"
                  />
                  <div className="text-left">
                    <div className="text-xs font-bold">{b.name}</div>
                    <div className="text-[10px] text-white/70">{b.designation}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={dismiss}
            className="mt-2 px-6 py-2.5 rounded-xl bg-white text-brand-700 font-bold text-sm hover:bg-white/90 transition-colors"
          >
            {selfBirthday ? 'Thank you! 🎉' : 'Nice!'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BirthdayPopup;
