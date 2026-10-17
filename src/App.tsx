import { TooltipProvider } from '@/components/ui/tooltip'

// React layer over the loom engine. Pieces of the interface move in here one at a time
// (see docs/functionality.md); until then the engine draws its own controls.
export default function App() {
  return <TooltipProvider delayDuration={400}>{null}</TooltipProvider>
}
