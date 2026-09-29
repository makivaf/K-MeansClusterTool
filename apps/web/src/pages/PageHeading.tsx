type PageHeadingProps = {
  title: string;
  description?: string;
};

export const PageHeading = ({ title, description }: PageHeadingProps) => (
  <div className="page-heading mb-6 border-b border-line pb-5">
    <h1 className="page-title">{title}</h1>
    {description ? <p className="page-subtitle max-w-4xl">{description}</p> : null}
  </div>
);
