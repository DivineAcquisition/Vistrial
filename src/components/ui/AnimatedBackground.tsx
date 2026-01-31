"use client"

interface AnimatedBackgroundProps {
  variant?: "default" | "subtle" | "intense"
}

export function AnimatedBackground({ variant = "default" }: AnimatedBackgroundProps) {
  const getOrbStyles = () => {
    switch (variant) {
      case "subtle":
        return {
          orb1: "w-[400px] h-[400px] bg-brand-600/10 blur-[100px]",
          orb2: "w-[350px] h-[350px] bg-brand-400/8 blur-[80px]",
          orb3: "w-[200px] h-[200px] bg-indigo-500/5 blur-[60px]",
        }
      case "intense":
        return {
          orb1: "w-[700px] h-[700px] bg-brand-600/25 blur-[140px]",
          orb2: "w-[600px] h-[600px] bg-brand-400/20 blur-[120px]",
          orb3: "w-[400px] h-[400px] bg-indigo-500/15 blur-[100px]",
        }
      default:
        return {
          orb1: "w-[600px] h-[600px] bg-brand-600/20 blur-[120px]",
          orb2: "w-[500px] h-[500px] bg-brand-400/15 blur-[100px]",
          orb3: "w-[300px] h-[300px] bg-indigo-500/10 blur-[80px]",
        }
    }
  }

  const styles = getOrbStyles()

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Main gradient orbs */}
      <div 
        className={`absolute top-[-20%] left-[-10%] rounded-full animate-pulse ${styles.orb1}`}
      />
      <div 
        className={`absolute bottom-[-20%] right-[-10%] rounded-full animate-pulse ${styles.orb2}`}
        style={{ animationDelay: "1s" }}
      />
      <div 
        className={`absolute top-[40%] right-[20%] rounded-full animate-pulse ${styles.orb3}`}
        style={{ animationDelay: "2s" }}
      />
      
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}
      />
    </div>
  )
}
