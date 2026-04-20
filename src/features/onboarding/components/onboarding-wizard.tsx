"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { generateKeywords } from "../actions/generate-keywords"
import { saveOnboarding } from "../actions/save-onboarding"
import {
  ONBOARDING_STEPS,
  type GeneratedKeywords,
  type OnboardingAnswers,
} from "../lib/types"
import { OnboardingStep } from "./onboarding-step"
import { ScanAnimation } from "./scan-animation"

type WizardStep = 1 | 2 | 3 | 4

export function OnboardingWizard() {
  const router = useRouter()

  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [productDescription, setProductDescription] = useState("")
  const [targetCustomer, setTargetCustomer] = useState("")
  const [competitorsInput, setCompetitorsInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [generated, setGenerated] = useState<GeneratedKeywords | null>(null)

  function parseCompetitors(raw: string): string[] {
    return raw
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
  }

  async function completeWizard(skipCompetitors: boolean) {
    setIsLoading(true)

    const answers: OnboardingAnswers = {
      productDescription: productDescription.trim(),
      targetCustomer: targetCustomer.trim(),
      competitors: skipCompetitors ? [] : parseCompetitors(competitorsInput),
    }

    try {
      const keywords = await generateKeywords({
        productDescription: answers.productDescription,
        targetCustomer: answers.targetCustomer,
        competitors: answers.competitors,
      })

      const result = await saveOnboarding({ answers, generated: keywords })

      if ("error" in result) {
        toast.error(result.error)
        setIsLoading(false)
        return
      }

      setGenerated(keywords)
      setCurrentStep(4)
    } catch (error) {
      console.error("[onboarding] completion failed", error)
      toast.error("Could not complete onboarding. Please try again.")
      setIsLoading(false)
    }
  }

  function handleStep1Next() {
    setCurrentStep(2)
  }

  function handleStep2Next() {
    setCurrentStep(3)
  }

  function handleStep3Next() {
    void completeWizard(false)
  }

  function handleStep3Skip() {
    void completeWizard(true)
  }

  function handleScanComplete() {
    router.push("/?onboarded=true")
  }

  if (currentStep === 4) {
    return (
      <ScanAnimation
        subreddits={generated?.subreddits ?? []}
        signalCount={0}
        onComplete={handleScanComplete}
      />
    )
  }

  const stepConfig = ONBOARDING_STEPS[currentStep - 1]

  if (currentStep === 1) {
    return (
      <OnboardingStep
        key="step-1"
        step={stepConfig}
        value={productDescription}
        onChange={setProductDescription}
        onNext={handleStep1Next}
        isLoading={isLoading}
      />
    )
  }

  if (currentStep === 2) {
    return (
      <OnboardingStep
        key="step-2"
        step={stepConfig}
        value={targetCustomer}
        onChange={setTargetCustomer}
        onNext={handleStep2Next}
        isLoading={isLoading}
      />
    )
  }

  return (
    <OnboardingStep
      key="step-3"
      step={stepConfig}
      value={competitorsInput}
      onChange={setCompetitorsInput}
      onNext={handleStep3Next}
      onSkip={handleStep3Skip}
      isLoading={isLoading}
    />
  )
}
