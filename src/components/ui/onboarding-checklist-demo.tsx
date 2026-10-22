"use client"

import { Bell, PlayCircle, User } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card"
import { InteractiveOnboardingChecklist, type Step } from "@/components/ui/onboarding-checklist"
import { Switch } from "@/components/ui/switch"

export default function InteractiveOnboardingChecklistDemo() {
  const [onboardingOpen, setOnboardingOpen] = useState(true)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [profileSetup, setProfileSetup] = useState(false)

  const steps: Step[] = [
    {
      id: "welcome",
      title: "Welcome to the platform",
      description: "Start here. The highlight shows you where to look.",
      targetSelector: "[data-onboard='welcome-button']",
      completed: completedSteps.has("welcome"),
    },
    {
      id: "profile",
      title: "Set up your profile",
      description: "Add the name people on your team will see.",
      targetSelector: "[data-onboard='profile-card']",
      completed: completedSteps.has("profile"),
    },
    {
      id: "notifications",
      title: "Enable notifications",
      description: "Turn on updates so nothing waits on you.",
      targetSelector: "[data-onboard='notifications-toggle']",
      completed: completedSteps.has("notifications"),
    },
  ]

  const complete = (stepId: string) => {
    setCompletedSteps((prev) => new Set([...prev, stepId]))
    if (stepId === "profile") setProfileSetup(true)
    if (stepId === "notifications") setNotificationsEnabled(true)
  }

  const reset = () => {
    setCompletedSteps(new Set())
    setNotificationsEnabled(false)
    setProfileSetup(false)
    setOnboardingOpen(true)
  }

  const completedCount = steps.filter((step) => completedSteps.has(step.id)).length

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex justify-center">
          <Button variant="outline" onClick={reset}>
            Reset demo
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <Card data-onboard="welcome-button">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PlayCircle className="size-5 text-primary" />
                  Welcome
                </CardTitle>
                <CardDescription>Where a new workspace starts.</CardDescription>
              </CardHeader>
              <CardPanel>
                <Button className="w-full" variant={completedSteps.has("welcome") ? "outline" : "primary"} onClick={() => complete("welcome")}>
                  {completedSteps.has("welcome") ? "Welcome complete" : "Get started"}
                </Button>
              </CardPanel>
            </Card>
            <Card data-onboard="profile-card" className={profileSetup ? "border-primary" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="size-5" />
                  Profile
                  {profileSetup ? <Badge className="ml-auto">Complete</Badge> : null}
                </CardTitle>
                <CardDescription>The name your team sees.</CardDescription>
              </CardHeader>
              <CardPanel className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="mb-1 text-sm font-medium">First name</p>
                    <div className="flex h-9 items-center rounded-md bg-muted px-3 text-sm text-muted-foreground">{profileSetup ? "Jordan" : "Enter a name"}</div>
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-medium">Last name</p>
                    <div className="flex h-9 items-center rounded-md bg-muted px-3 text-sm text-muted-foreground">{profileSetup ? "Reyes" : "Enter a name"}</div>
                  </div>
                </div>
                <Button className="w-full" variant={profileSetup ? "outline" : "primary"} onClick={() => complete("profile")}>
                  {profileSetup ? "Profile complete" : "Complete profile"}
                </Button>
              </CardPanel>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="size-5" />
                Notifications
              </CardTitle>
              <CardDescription>How you hear about what is waiting.</CardDescription>
            </CardHeader>
            <CardPanel>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">Push notifications</div>
                  <div className="text-sm text-muted-foreground">Updates that need you.</div>
                </div>
                <Switch
                  data-onboard="notifications-toggle"
                  checked={notificationsEnabled}
                  onCheckedChange={(checked) => {
                    setNotificationsEnabled(checked)
                    if (checked) complete("notifications")
                  }}
                  aria-label="Push notifications"
                />
              </div>
            </CardPanel>
          </Card>
        </div>
      </div>
      <InteractiveOnboardingChecklist steps={steps} open={onboardingOpen} onOpenChange={setOnboardingOpen} onCompleteStep={complete} onFinish={() => setOnboardingOpen(false)} />
      {onboardingOpen ? null : (
        <div className="fixed bottom-4 right-4 z-40">
          <Button variant="primary" size="icon-lg" aria-label={completedCount > 0 ? "Continue onboarding" : "Start onboarding"} className="rounded-full shadow-lg" onClick={() => setOnboardingOpen(true)}>
            <PlayCircle />
          </Button>
        </div>
      )}
    </div>
  )
}
