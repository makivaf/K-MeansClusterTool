type PageHeadingProps = {
  title: string;
  description: string;
};

export const PageHeading = ({ title, description }: PageHeadingProps) => (
  <div className="mb-5">
    <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{description}</p>
  </div>
);
