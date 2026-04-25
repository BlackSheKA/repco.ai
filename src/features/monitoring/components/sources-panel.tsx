"use client"

import { useState, useTransition } from "react"
import { X } from "lucide-react"
import { LinkedinLogoIcon, RedditLogoIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  addSource,
  removeSource,
  type SourceType,
} from "@/features/monitoring/actions/settings-actions"

type SourceItem = { id: string; value: string }

interface SourcesPanelProps {
  redditKeywords: SourceItem[]
  subreddits: SourceItem[]
  linkedinKeywords: SourceItem[]
  linkedinCompanies: SourceItem[]
  linkedinAuthors: SourceItem[]
}

export function SourcesPanel({
  redditKeywords,
  subreddits,
  linkedinKeywords,
  linkedinCompanies,
  linkedinAuthors,
}: SourcesPanelProps) {
  const redditCount = redditKeywords.length + subreddits.length
  const linkedinCount =
    linkedinKeywords.length + linkedinCompanies.length + linkedinAuthors.length

  return (
    <Tabs defaultValue="reddit" className="max-w-3xl">
      <TabsList className="h-10 p-1">
        <TabsTrigger value="reddit" className="h-8 px-4 text-sm">
          <RedditLogoIcon weight="fill" className="size-4 text-[#FF4500]" />
          Reddit
          <span className="ml-1 rounded-full bg-foreground/10 px-1.5 py-0.5 text-xs font-medium">
            {redditCount}
          </span>
        </TabsTrigger>
        <TabsTrigger value="linkedin" className="h-8 px-4 text-sm">
          <LinkedinLogoIcon weight="fill" className="size-4 text-[#0A66C2]" />
          LinkedIn
          <span className="ml-1 rounded-full bg-foreground/10 px-1.5 py-0.5 text-xs font-medium">
            {linkedinCount}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="reddit" className="mt-6">
        <div className="flex flex-col gap-6">
          <SourceSection
            label="Keywords"
            description="Posts containing these words will be detected as signals."
            placeholder="Add a keyword..."
            buttonLabel="Add keyword"
            signalType="reddit_keyword"
            items={redditKeywords}
          />
          <Separator />
          <SourceSection
            label="Subreddits"
            description="Reddit communities to monitor."
            placeholder="r/subreddit"
            buttonLabel="Add subreddit"
            signalType="subreddit"
            items={subreddits}
          />
        </div>
      </TabsContent>

      <TabsContent value="linkedin" className="mt-6">
        <div className="flex flex-col gap-6">
          <SourceSection
            label="Keywords"
            description="Posts containing these words will be detected as signals."
            placeholder="Add a keyword..."
            buttonLabel="Add keyword"
            signalType="linkedin_keyword"
            items={linkedinKeywords}
          />
          <Separator />
          <SourceSection
            label="Target companies"
            description="Posts mentioning these companies will surface as signals."
            placeholder="Acme Corp"
            buttonLabel="Add company"
            signalType="linkedin_company"
            items={linkedinCompanies}
          />
          <Separator />
          <SourceSection
            label="Authors / influencers"
            description="Posts by or mentioning these people will surface as signals."
            placeholder="John Smith"
            buttonLabel="Add author"
            signalType="linkedin_author"
            items={linkedinAuthors}
          />
        </div>
      </TabsContent>
    </Tabs>
  )
}

interface SourceSectionProps {
  label: string
  description: string
  placeholder: string
  buttonLabel: string
  signalType: SourceType
  items: SourceItem[]
}

function SourceSection({
  label,
  description,
  placeholder,
  buttonLabel,
  signalType,
  items,
}: SourceSectionProps) {
  const [input, setInput] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    const value = input.trim()
    if (!value) return
    setInput("")
    startTransition(async () => {
      const result = await addSource(value, signalType)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`${label} added`)
      }
    })
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeSource(id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`${label} removed`)
      }
    })
  }

  return (
    <section>
      <h3 className="font-sans text-sm font-medium">{label}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-3 flex items-center gap-2">
        <Input
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleAdd()
            }
          }}
          disabled={isPending}
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={isPending || !input.trim()}
        >
          {buttonLabel}
        </Button>
      </div>
      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-1 font-sans text-sm"
            >
              {item.value}
              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                disabled={isPending}
                aria-label={`Remove ${label.toLowerCase()} ${item.value}`}
                className="text-muted-foreground hover:text-accent-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
