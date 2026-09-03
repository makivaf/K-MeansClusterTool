type PageHeadingProps = {
  title: string;
  description: string;
};

export const PageHeading = ({ title, description }: PageHeadingProps) => (
  <div className="mb-7 border-b border-line pb-5">
    <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-[2rem]">{title}</h1>
    <p className="mt-2 max-w-4xl text-[15px] leading-6 text-muted">{description}</p>
  </div>
);
