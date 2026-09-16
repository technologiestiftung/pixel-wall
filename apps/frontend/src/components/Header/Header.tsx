function Logo() {
	return (
		<div className="relative h-[34px] w-[38px] shrink-0" aria-hidden="true">
			<div className="absolute left-0 top-[13px] size-[12px] rounded-[1px] bg-[#20201b]" />
			<div className="absolute left-[4px] top-[5px] size-[6px] rounded-[1px] bg-[#20201b]" />
			<div className="absolute left-[26px] top-[27px] size-[6px] rounded-[1px] bg-[#20201b]" />
			<div className="absolute left-[28px] top-px size-[6px] rounded-[1px] bg-[#20201b]" />
			<div className="absolute left-[13px] top-[6px] size-[12px] rounded-[1px] bg-[#20201b]" />
			<div className="absolute left-[13px] top-[19px] size-[12px] rounded-[1px] bg-[#20201b]" />
			<div className="absolute left-[26px] top-[9.5px] size-[12px] rounded-[1px] bg-[#20201b]" />
		</div>
	);
}

export function Header() {
	return (
		<header className="flex h-[72px] items-center gap-3 border-b-[0.5px] border-[#595959] bg-white px-7">
			<Logo />
			<h1 className="whitespace-nowrap text-[19px] font-semibold text-[#20201b]">
				Pixel Displays Foyer
			</h1>
		</header>
	);
}
