import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <Badge variant="secondary" className="mb-4">
          Foundation
        </Badge>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">
          Vistrial
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Case files for high-ticket sales teams. Know the lead before you dial.
        </p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display text-base">
            Readiness score
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="tabular text-5xl font-semibold text-primary">
              78
            </span>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Theme, fonts, and Supabase clients are wired. Ready for Prompt 2
            (schema and tenancy).
          </p>
          <Button className="w-full">Open case file</Button>
        </CardContent>
      </Card>
    </main>
  );
}
