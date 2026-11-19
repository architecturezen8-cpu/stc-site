import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    /* v2.9.12.4 — initial read is deferred one frame: a synchronous
       setState inside the effect body triggers cascading renders
       (react-hooks/set-state-in-effect). */
    const raf = requestAnimationFrame(onChange)
    return () => {
      cancelAnimationFrame(raf)
      mql.removeEventListener("change", onChange)
    }
  }, [])

  return !!isMobile
}
