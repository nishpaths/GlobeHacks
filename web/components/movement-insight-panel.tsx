import type { MovementTelemetry } from "@globe/contracts";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface MovementInsightPanelProps {
  movement: MovementTelemetry;
  className?: string;
}

export function MovementInsightPanel({ movement, className }: MovementInsightPanelProps) {
  const { protocolSuggestion, asymmetryAnalysis } = movement;

  return (
    <div className={cn("flex w-full flex-col gap-4", className)}>
      <Card>
        <CardHeader>
          <CardTitle>Protocol</CardTitle>
          <CardDescription>Suggested recovery parameters from the latest capture.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Thermal {protocolSuggestion.thermalCycleSeconds}s</Badge>
            <Badge variant="secondary">
              Mechanical {protocolSuggestion.mechanicalFrequencyHz} Hz
            </Badge>
            <Badge variant="outline">
              Red {protocolSuggestion.photobiomodulation.redNm} nm · Blue{" "}
              {protocolSuggestion.photobiomodulation.blueNm} nm
            </Badge>
          </div>
          <Separator />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-muted-foreground">
            <dt>Thermal cycle</dt>
            <dd className="text-right font-medium text-card-foreground">
              {protocolSuggestion.thermalCycleSeconds} s
            </dd>
            <dt>Mechanical frequency</dt>
            <dd className="text-right font-medium text-card-foreground">
              {protocolSuggestion.mechanicalFrequencyHz} Hz
            </dd>
            <dt>Red / Blue (nm)</dt>
            <dd className="text-right font-medium text-card-foreground">
              {protocolSuggestion.photobiomodulation.redNm} /{" "}
              {protocolSuggestion.photobiomodulation.blueNm}
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Asymmetry</CardTitle>
          <CardDescription>Left vs right peaks and whether the delta exceeds threshold.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Joint</TableHead>
                <TableHead className="text-right">L</TableHead>
                <TableHead className="text-right">R</TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead className="text-right">Alert</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {asymmetryAnalysis.map((row) => (
                <TableRow key={row.jointType}>
                  <TableCell className="font-medium">{row.jointType}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.leftPeak.toFixed(1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.rightPeak.toFixed(1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.delta.toFixed(1)}</TableCell>
                  <TableCell className="text-right">
                    {row.thresholdExceeded ? (
                      <Badge variant="destructive">Exceeded</Badge>
                    ) : (
                      <Badge variant="outline">OK</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
