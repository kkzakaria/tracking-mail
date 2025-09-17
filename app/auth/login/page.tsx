import { Mail } from "lucide-react"
import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center relative overflow-hidden p-4">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-white/10 animate-float"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-white/5 animate-pulse-slow"></div>
        <div className="absolute top-1/2 left-1/4 w-32 h-32 rounded-full bg-white/10 animate-pulse-slow"></div>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-6 relative z-10">
        {/* Header with logo */}
        <div className="flex items-center gap-2 self-center font-medium">
          <div className="p-3 glass-card rounded-2xl shadow-glow">
            <Mail className="h-8 w-8 text-white" />
          </div>
          <span className="text-2xl font-bold text-white">Tracking Mail</span>
        </div>

        {/* Login Form with glass effect */}
        <div className="glass-card rounded-3xl overflow-hidden shadow-glow">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}