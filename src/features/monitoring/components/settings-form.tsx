"use client"

import { useState, useTransition } from "react"
import { X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  addKeyword,
  removeKeyword,
  addSubreddit,
  removeSubreddit,
} from "@/features/monitoring/actions/settings-actions"

interface SettingsFormProps {
  keywords: { id: string; value: string }[]
  subreddits: { id: string; value: string }[]
}

export function SettingsForm({ keywords, subreddits }: SettingsFormProps) {
  const [keywordInput, setKeywordInput] = useState("")
  const [subredditInput, setSubredditInput] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleAddKeyword() {
    if (!keywordInput.trim()) return
    const value = keywordInput
    setKeywordInput("")

    startTransition(async () => {
      const result = await addKeyword(value)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Keyword added")
      }
    })
  }

  function handleRemoveKeyword(id: string) {
    startTransition(async () => {
      const result = await removeKeyword(id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Keyword removed")
      }
    })
  }

  function handleAddSubreddit() {
    if (!subredditInput.trim()) return
    const value = subredditInput
    setSubredditInput("")

    startTransition(async () => {
      const result = await addSubreddit(value)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Subreddit added")
      }
    })
  }

  function handleRemoveSubreddit(id: string) {
    startTransition(async () => {
      const result = await removeSubreddit(id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Subreddit removed")
      }
    })
  }

  return (
    <div className="max-w-[640px]">
      {/* Keywords Section */}
      <section>
        <h2 className="font-sans text-base font-medium">Keywords</h2>
        <p className="mt-4 text-sm text-muted-foreground">
          Posts containing these words will be detected as signals.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Input
            placeholder="Add a keyword..."
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleAddKeyword()
              }
            }}
            disabled={isPending}
          />
          <Button
            size="sm"
            onClick={handleAddKeyword}
            disabled={isPending || !keywordInput.trim()}
          >
            Add Keyword
          </Button>
        </div>
        {keywords.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <span
                key={kw.id}
                className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-1 font-sans text-sm"
              >
                {kw.value}
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(kw.id)}
                  disabled={isPending}
                  aria-label={`Remove keyword ${kw.value}`}
                  className="text-muted-foreground hover:text-accent-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <Separator className="my-8" />

      {/* Subreddits Section */}
      <section>
        <h2 className="font-sans text-base font-medium">Subreddits</h2>
        <p className="mt-4 text-sm text-muted-foreground">
          Reddit communities to monitor for intent signals.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Input
            placeholder="r/subreddit"
            value={subredditInput}
            onChange={(e) => setSubredditInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleAddSubreddit()
              }
            }}
            disabled={isPending}
          />
          <Button
            size="sm"
            onClick={handleAddSubreddit}
            disabled={isPending || !subredditInput.trim()}
          >
            Add Subreddit
          </Button>
        </div>
        {subreddits.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {subreddits.map((sub) => (
              <span
                key={sub.id}
                className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-1 font-sans text-sm"
              >
                {sub.value}
                <button
                  type="button"
                  onClick={() => handleRemoveSubreddit(sub.id)}
                  disabled={isPending}
                  aria-label={`Remove subreddit ${sub.value}`}
                  className="text-muted-foreground hover:text-accent-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
