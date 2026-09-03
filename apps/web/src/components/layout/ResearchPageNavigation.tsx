import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { researchPages, type ResearchPagePath } from "./researchNavigation";

type ResearchPageNavigationProps = {
  currentPath: ResearchPagePath;
};

const linkClass = "flex min-h-16 items-center gap-3 border-y border-line bg-transparent px-1 py-3 text-sm transition hover:border-teal-200 hover:text-teal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2";

export const ResearchPageNavigation = ({ currentPath }: ResearchPageNavigationProps) => {
  const currentIndex = researchPages.findIndex((page) => page.path === currentPath);
  const previousPage = researchPages[currentIndex - 1];
  const nextPage = researchPages[currentIndex + 1];

  return (
    <nav className="mt-10 grid gap-3 sm:grid-cols-2" aria-label="Research page sequence">
      {previousPage ? (
        <Link to={previousPage.path} className={linkClass} rel="prev">
          <ArrowLeft className="shrink-0 text-teal-700" size={19} aria-hidden="true" />
          <span>
            <span className="block text-xs font-medium uppercase tracking-wide text-muted">Previous</span>
            <span className="mt-1 block font-semibold text-ink">{previousPage.step} {previousPage.label}</span>
          </span>
        </Link>
      ) : <span aria-hidden="true" />}
      {nextPage ? (
        <Link to={nextPage.path} className={`${linkClass} justify-between sm:text-right`} rel="next">
          <span className="sm:ml-auto">
            <span className="block text-xs font-medium uppercase tracking-wide text-muted">Next</span>
            <span className="mt-1 block font-semibold text-ink">{nextPage.step} {nextPage.label}</span>
          </span>
          <ArrowRight className="shrink-0 text-teal-700" size={19} aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
};
