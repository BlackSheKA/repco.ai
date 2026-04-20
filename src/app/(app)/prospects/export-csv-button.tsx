"use client"

import { useTransition } from "react"
import { Download } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

import { exportProspectsCSV } from "@/features/prospects/actions/export-csv"

export function ExportCsvButton() {
  const [isPending, startTransition] = useTransition()

  const handleExport = () => {
    startTransition(async () => {
      const res = await exportProspectsCSV()
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const ts = new Date().toISOString().slice(0, 10)
      a.download = `prospects-${ts}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Exported prospects")
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleExport}
      disabled={isPending}
    >
      <Download className="mr-2 h-4 w-4" />
      {isPending ? "Exporting..." : "Export CSV"}
    </Button>
  )
}
